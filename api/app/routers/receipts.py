# app/routers/receipts.py
from datetime import datetime, date, time
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    Material,
    MaterialLot,
    StockTransaction,
    MaterialApprovedManufacturer,
    User,
    StockTransactionEdit,
)
from ..schemas import ReceiptCreate, ReceiptOut, ReceiptUpdate
from ..security import require_permission

router = APIRouter(prefix="/receipts", tags=["receipts"])


def _normalise_receipt_datetime(value: datetime | date) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    return datetime.utcnow()


def _round_money(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value) + 1e-12, 2)


def _round_unit(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value) + 1e-12, 4)


def _derive_costs(qty: float, unit_price: float | None, total_value: float | None) -> tuple[float | None, float | None]:
    """
    Costing rules:
    - If total_value provided: derive unit_price = total_value / qty (4dp), keep total_value (2dp)
    - Else if unit_price provided: derive total_value = qty * unit_price (2dp), keep unit_price (4dp)
    - Else: both None
    """
    q = float(qty or 0.0)
    if q <= 0:
        # qty is required/validated elsewhere, but guard anyway
        return None, None

    if total_value is not None:
        tv = float(total_value)
        up = tv / q
        return _round_unit(up), _round_money(tv)

    if unit_price is not None:
        up = float(unit_price)
        tv = q * up
        return _round_unit(up), _round_money(tv)

    return None, None


@router.post("/", response_model=ReceiptOut, status_code=201)
def create_receipt(
    payload: ReceiptCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("receipts.create")),
) -> ReceiptOut:
    created_by = user.username

    if not payload.complies_es_criteria:
        raise HTTPException(
            status_code=400,
            detail="Ensure goods in comply with ES criteria specified in ES.SOP.112",
        )

    material = (
        db.query(Material)
        .filter(Material.material_code == payload.material_code)
        .one_or_none()
    )
    if material is None:
        raise HTTPException(status_code=404, detail="Material not found")

    if material.category_code == "TABLETS_CAPSULES":
        approved_rows = (
            db.query(MaterialApprovedManufacturer)
            .filter(
                MaterialApprovedManufacturer.material_id == material.id,
                MaterialApprovedManufacturer.is_active.is_(True),
            )
            .all()
        )
        approved_names = [
            (row.manufacturer_name or "").strip().upper() for row in approved_rows
        ]
        approved_names = [n for n in approved_names if n]

        if approved_names:
            incoming = (payload.manufacturer or "").strip().upper()
            if not incoming or incoming not in approved_names:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Manufacturer '{payload.manufacturer or ''}' is not in the "
                        f"approved list for {material.material_code} ({material.name}). "
                        "Please refer to R&D before booking in. Add the manufacturer "
                        "to the approved list if approved."
                    ),
                )

    lot = (
        db.query(MaterialLot)
        .filter(
            MaterialLot.material_id == material.id,
            MaterialLot.lot_number == payload.lot_number,
        )
        .one_or_none()
    )

    if lot is None:
        lot = MaterialLot(
            material_id=material.id,
            lot_number=payload.lot_number,
            expiry_date=payload.expiry_date,
            status="AVAILABLE",
            manufacturer=payload.manufacturer,
            supplier=payload.supplier,
            created_by=created_by,
        )
        db.add(lot)
        db.flush()
    else:
        if payload.expiry_date and lot.expiry_date != payload.expiry_date:
            lot.expiry_date = payload.expiry_date

        if payload.manufacturer and not lot.manufacturer:
            lot.manufacturer = payload.manufacturer
        if payload.supplier and not lot.supplier:
            lot.supplier = payload.supplier

    if payload.manufacturer and not material.manufacturer:
        material.manufacturer = payload.manufacturer
    if payload.supplier and not material.supplier:
        material.supplier = payload.supplier

    created_at = _normalise_receipt_datetime(payload.receipt_date)

    # ✅ D1 costing flip: accept total_value from UI, derive unit_price
    derived_unit_price, derived_total_value = _derive_costs(
        qty=float(payload.qty),
        unit_price=payload.unit_price,
        total_value=payload.total_value,
    )

    txn = StockTransaction(
        material_lot_id=lot.id,
        txn_type="RECEIPT",
        qty=payload.qty,
        uom_code=payload.uom_code,
        direction=1,
        unit_price=derived_unit_price,
        total_value=derived_total_value,
        target_ref=payload.target_ref,
        comment=payload.comment,
        product_manufacture_date=None,
        created_at=created_at,
        created_by=created_by,
    )

    db.add(txn)
    db.commit()
    db.refresh(txn)
    db.refresh(lot)
    db.refresh(material)

    return ReceiptOut(
        id=txn.id,
        material_code=material.material_code,
        material_name=material.name,
        lot_number=lot.lot_number,
        expiry_date=lot.expiry_date,
        qty=txn.qty,
        uom_code=txn.uom_code,
        unit_price=txn.unit_price,
        total_value=txn.total_value,
        target_ref=txn.target_ref,
        supplier=lot.supplier or material.supplier,
        manufacturer=lot.manufacturer or material.manufacturer,
        complies_es_criteria=True,
        created_at=txn.created_at,
        created_by=txn.created_by or created_by,
        comment=txn.comment,
    )


@router.get("/", response_model=List[ReceiptOut])
def list_receipts(
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("receipts.view")),
) -> List[ReceiptOut]:
    stmt = (
        select(StockTransaction, MaterialLot, Material)
        .join(MaterialLot, StockTransaction.material_lot_id == MaterialLot.id)
        .join(Material, MaterialLot.material_id == Material.id)
        .where(StockTransaction.txn_type == "RECEIPT")
        .order_by(StockTransaction.created_at.desc())
        .limit(limit)
    )

    rows = db.execute(stmt).all()

    results: List[ReceiptOut] = []
    for txn, lot, material in rows:
        results.append(
            ReceiptOut(
                id=txn.id,
                material_code=material.material_code,
                material_name=material.name,
                lot_number=lot.lot_number,
                expiry_date=lot.expiry_date,
                qty=txn.qty,
                uom_code=txn.uom_code,
                unit_price=txn.unit_price,
                total_value=txn.total_value,
                target_ref=txn.target_ref,
                supplier=lot.supplier or material.supplier,
                manufacturer=lot.manufacturer or material.manufacturer,
                complies_es_criteria=True,
                created_at=txn.created_at,
                created_by=txn.created_by or "—",
                comment=txn.comment,
            )
        )

    return results


@router.put("/{receipt_id}", response_model=ReceiptOut)
def update_receipt(
    receipt_id: int,
    payload: ReceiptUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("receipts.edit")),
) -> ReceiptOut:
    reason = (payload.edit_reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="edit_reason is required")

    txn: StockTransaction | None = (
        db.query(StockTransaction).filter(StockTransaction.id == receipt_id).one_or_none()
    )
    if txn is None or txn.txn_type != "RECEIPT":
        raise HTTPException(status_code=404, detail="Receipt not found")

    lot = db.query(MaterialLot).filter(MaterialLot.id == txn.material_lot_id).one()
    material = db.query(Material).filter(Material.id == lot.material_id).one()

    before_json = StockTransactionEdit.snapshot_txn(txn)

    current_balance = (
        db.query(func.coalesce(func.sum(StockTransaction.qty * StockTransaction.direction), 0.0))
        .filter(StockTransaction.material_lot_id == txn.material_lot_id)
        .scalar()
    )
    current_balance = float(current_balance or 0.0)

    # Remove old receipt, apply new qty, ensure non-negative
    balance_without_old = current_balance - float(txn.qty or 0.0)
    new_balance = balance_without_old + float(payload.qty)
    if new_balance < -1e-9:
        raise HTTPException(
            status_code=400,
            detail=(
                "Edit would make lot balance negative. "
                f"Lot {lot.lot_number} would become {new_balance:.3f}."
            ),
        )

    txn.qty = float(payload.qty)

    # ✅ Costing edit logic:
    # - If user supplies total_value -> derive unit_price from total/qty
    # - Else if user supplies unit_price -> derive total_value from qty*unit
    # - Else if qty changed and we already have unit_price -> recompute total_value
    incoming_unit = payload.unit_price if payload.unit_price is not None else txn.unit_price
    incoming_total = payload.total_value if payload.total_value is not None else txn.total_value

    if payload.total_value is not None:
        derived_unit_price, derived_total_value = _derive_costs(txn.qty, None, float(payload.total_value))
        txn.unit_price = derived_unit_price
        txn.total_value = derived_total_value
    elif payload.unit_price is not None:
        derived_unit_price, derived_total_value = _derive_costs(txn.qty, float(payload.unit_price), None)
        txn.unit_price = derived_unit_price
        txn.total_value = derived_total_value
    else:
        # no explicit costing fields provided; keep unit_price and recompute total_value if possible
        txn.unit_price = _round_unit(incoming_unit) if incoming_unit is not None else None
        if txn.unit_price is not None:
            txn.total_value = _round_money(txn.qty * txn.unit_price)
        else:
            txn.total_value = _round_money(incoming_total) if incoming_total is not None else None

    txn.target_ref = payload.target_ref
    txn.comment = payload.comment

    if payload.receipt_date is not None:
        txn.created_at = _normalise_receipt_datetime(payload.receipt_date)

    after_json = StockTransactionEdit.snapshot_txn(txn)

    audit = StockTransactionEdit(
        stock_transaction_id=txn.id,
        edited_by=user.username,
        edit_reason=reason,
        before_json=before_json,
        after_json=after_json,
    )
    db.add(audit)
    db.commit()
    db.refresh(txn)
    db.refresh(lot)
    db.refresh(material)

    return ReceiptOut(
        id=txn.id,
        material_code=material.material_code,
        material_name=material.name,
        lot_number=lot.lot_number,
        expiry_date=lot.expiry_date,
        qty=txn.qty,
        uom_code=txn.uom_code,
        unit_price=txn.unit_price,
        total_value=txn.total_value,
        target_ref=txn.target_ref,
        supplier=lot.supplier or material.supplier,
        manufacturer=lot.manufacturer or material.manufacturer,
        complies_es_criteria=True,
        created_at=txn.created_at,
        created_by=txn.created_by or "—",
        comment=txn.comment,
    )
