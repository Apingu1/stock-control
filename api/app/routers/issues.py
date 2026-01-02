# app/routers/issues.py
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Material, MaterialLot, StockTransaction, User, StockTransactionEdit
from ..schemas import IssueCreate, IssueOut, IssueUpdate
from ..security import require_permission

router = APIRouter(prefix="/issues", tags=["issues"])


def _round_money(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value) + 1e-12, 2)


def _round_unit(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value) + 1e-12, 4)


def _lot_weighted_unit_price(db: Session, lot_id: int) -> float | None:
    """
    D2 (Option A): Use the lot's actual cost basis.
    Weighted average of RECEIPT transactions for this lot:
      unit = SUM(receipt_total_value) / SUM(receipt_qty)

    If some old receipts have total_value NULL but unit_price present, we treat
    total_value as (unit_price * qty) for the purpose of the weighting.
    """
    sum_value, sum_qty = (
        db.query(
            func.coalesce(
                func.sum(func.coalesce(StockTransaction.total_value, StockTransaction.unit_price * StockTransaction.qty)),
                0.0,
            ),
            func.coalesce(func.sum(StockTransaction.qty), 0.0),
        )
        .filter(
            StockTransaction.material_lot_id == lot_id,
            StockTransaction.txn_type == "RECEIPT",
        )
        .one()
    )

    sum_value = float(sum_value or 0.0)
    sum_qty = float(sum_qty or 0.0)
    if sum_qty <= 0:
        return None

    return _round_unit(sum_value / sum_qty)


@router.post("/", response_model=IssueOut, status_code=201)
def create_issue(
    payload: IssueCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("issues.create")),
) -> IssueOut:
    created_by = user.username

    material = (
        db.query(Material)
        .filter(Material.material_code == payload.material_code)
        .one_or_none()
    )
    if material is None:
        raise HTTPException(status_code=404, detail="Material not found")

    lot = None
    if payload.material_lot_id is not None:
        lot = (
            db.query(MaterialLot)
            .filter(
                MaterialLot.id == payload.material_lot_id,
                MaterialLot.material_id == material.id,
            )
            .one_or_none()
        )
        if lot is None:
            raise HTTPException(status_code=404, detail="Lot segment not found")
    else:
        matches = (
            db.query(MaterialLot)
            .filter(
                MaterialLot.material_id == material.id,
                MaterialLot.lot_number == payload.lot_number,
            )
            .order_by(MaterialLot.id.asc())
            .all()
        )

        if len(matches) == 0:
            lot = MaterialLot(
                material_id=material.id,
                lot_number=payload.lot_number,
                expiry_date=None,
                status="AVAILABLE",
                created_by=created_by,
            )
            db.add(lot)
            db.flush()
        elif len(matches) == 1:
            lot = matches[0]
        else:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Multiple lot segments exist for this lot number. "
                    "Please select a specific segment (material_lot_id)."
                ),
            )

    current_balance = (
        db.query(
            func.coalesce(
                func.sum(StockTransaction.qty * StockTransaction.direction), 0.0
            )
        )
        .filter(StockTransaction.material_lot_id == lot.id)
        .scalar()
    )
    current_balance = float(current_balance or 0.0)

    if current_balance < payload.qty:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient stock in lot {lot.lot_number} "
                f"(available {current_balance}, requested {payload.qty})"
            ),
        )

    # ✅ D2 costing: derive issue unit cost from lot weighted receipts
    lot_unit_price = _lot_weighted_unit_price(db, lot.id)
    issue_total_value = _round_money(float(payload.qty) * lot_unit_price) if lot_unit_price is not None else None

    now = datetime.utcnow()
    txn = StockTransaction(
        material_lot_id=lot.id,
        txn_type="ISSUE",
        consumption_type=payload.consumption_type or "USAGE",
        qty=payload.qty,
        uom_code=payload.uom_code,
        direction=-1,
        unit_price=lot_unit_price,
        total_value=issue_total_value,
        target_ref=payload.target_ref,
        product_batch_no=payload.product_batch_no,
        product_manufacture_date=payload.product_manufacture_date,
        comment=payload.comment,
        material_status_at_txn=lot.status,  # snapshot at time of usage
        created_at=now,
        created_by=created_by,
    )

    db.add(txn)
    db.commit()
    db.refresh(txn)
    db.refresh(lot)
    db.refresh(material)

    manufacturer = lot.manufacturer or material.manufacturer
    supplier = lot.supplier or material.supplier

    return IssueOut(
        id=txn.id,
        material_code=material.material_code,
        material_name=material.name,
        lot_number=lot.lot_number,
        expiry_date=lot.expiry_date,
        qty=txn.qty,
        uom_code=txn.uom_code,
        unit_price=txn.unit_price,
        total_value=txn.total_value,
        product_batch_no=txn.product_batch_no,
        manufacturer=manufacturer,
        supplier=supplier,
        product_manufacture_date=txn.product_manufacture_date,
        consumption_type=txn.consumption_type or "USAGE",
        target_ref=txn.target_ref,
        created_at=txn.created_at,
        created_by=txn.created_by or created_by,
        comment=txn.comment,
        material_status_at_txn=txn.material_status_at_txn,
    )


@router.get("/", response_model=List[IssueOut])
def list_issues(
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("issues.view")),
) -> List[IssueOut]:
    stmt = (
        select(StockTransaction, MaterialLot, Material)
        .join(MaterialLot, StockTransaction.material_lot_id == MaterialLot.id)
        .join(Material, MaterialLot.material_id == Material.id)
        .where(StockTransaction.txn_type == "ISSUE")
        .order_by(StockTransaction.created_at.desc())
        .limit(limit)
    )

    rows = db.execute(stmt).all()
    results: List[IssueOut] = []

    for txn, lot, material in rows:
        manufacturer = lot.manufacturer or material.manufacturer
        supplier = lot.supplier or material.supplier

        results.append(
            IssueOut(
                id=txn.id,
                material_code=material.material_code,
                material_name=material.name,
                lot_number=lot.lot_number,
                expiry_date=lot.expiry_date,
                qty=txn.qty,
                uom_code=txn.uom_code,
                unit_price=txn.unit_price,
                total_value=txn.total_value,
                product_batch_no=txn.product_batch_no,
                manufacturer=manufacturer,
                supplier=supplier,
                product_manufacture_date=txn.product_manufacture_date,
                consumption_type=txn.consumption_type or "USAGE",
                target_ref=txn.target_ref,
                created_at=txn.created_at,
                created_by=txn.created_by or "—",
                comment=txn.comment,
                material_status_at_txn=txn.material_status_at_txn,
            )
        )

    return results


@router.put("/{issue_id}", response_model=IssueOut)
def update_issue(
    issue_id: int,
    payload: IssueUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("issues.edit")),
) -> IssueOut:
    reason = (payload.edit_reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="edit_reason is required")

    txn: StockTransaction | None = (
        db.query(StockTransaction).filter(StockTransaction.id == issue_id).one_or_none()
    )
    if txn is None or txn.txn_type != "ISSUE":
        raise HTTPException(status_code=404, detail="Issue not found")

    lot = db.query(MaterialLot).filter(MaterialLot.id == txn.material_lot_id).one()
    material = db.query(Material).filter(Material.id == lot.material_id).one()

    before_json = StockTransactionEdit.snapshot_txn(txn)

    current_balance = (
        db.query(func.coalesce(func.sum(StockTransaction.qty * StockTransaction.direction), 0.0))
        .filter(StockTransaction.material_lot_id == txn.material_lot_id)
        .scalar()
    )
    current_balance = float(current_balance or 0.0)

    # remove old issue (adds stock back), then apply new qty
    balance_without_old = current_balance + float(txn.qty or 0.0)
    if float(payload.qty) > balance_without_old + 1e-9:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient stock in lot {lot.lot_number} "
                f"(available {balance_without_old}, requested {payload.qty})"
            ),
        )

    txn.qty = float(payload.qty)
    txn.consumption_type = payload.consumption_type or "USAGE"
    txn.target_ref = payload.target_ref
    txn.product_batch_no = payload.product_batch_no
    txn.product_manufacture_date = payload.product_manufacture_date
    txn.comment = payload.comment
    # Keep txn.material_status_at_txn unchanged (historical snapshot)

    # ✅ Recompute costing for the edited qty.
    # Prefer: keep the original unit_price on the txn if present (historical),
    # otherwise compute from lot receipts.
    unit_price = txn.unit_price
    if unit_price is None:
        unit_price = _lot_weighted_unit_price(db, lot.id)

    txn.unit_price = unit_price
    txn.total_value = _round_money(txn.qty * unit_price) if unit_price is not None else None

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

    manufacturer = lot.manufacturer or material.manufacturer
    supplier = lot.supplier or material.supplier

    return IssueOut(
        id=txn.id,
        material_code=material.material_code,
        material_name=material.name,
        lot_number=lot.lot_number,
        expiry_date=lot.expiry_date,
        qty=txn.qty,
        uom_code=txn.uom_code,
        unit_price=txn.unit_price,
        total_value=txn.total_value,
        product_batch_no=txn.product_batch_no,
        manufacturer=manufacturer,
        supplier=supplier,
        product_manufacture_date=txn.product_manufacture_date,
        consumption_type=txn.consumption_type or "USAGE",
        target_ref=txn.target_ref,
        created_at=txn.created_at,
        created_by=txn.created_by or "—",
        comment=txn.comment,
        material_status_at_txn=txn.material_status_at_txn,
    )
