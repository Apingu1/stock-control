from datetime import datetime, date, time
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Material, MaterialLot, StockTransaction, MaterialApprovedManufacturer
from ..schemas import ReceiptCreate, ReceiptOut

router = APIRouter(prefix="/receipts", tags=["receipts"])


def _normalise_receipt_datetime(value: datetime | date) -> datetime:
    """
    Normalise a date/datetime into a full datetime for created_at.
    """
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    return datetime.utcnow()


@router.post("/", response_model=ReceiptOut, status_code=201)
def create_receipt(
    payload: ReceiptCreate,
    db: Session = Depends(get_db),
) -> ReceiptOut:
    """
    Create a new goods receipt.

    Behaviour:
    - Looks up the Material by material_code.
    - For TABLETS_CAPSULES, if there are approved manufacturers configured,
      enforces that payload.manufacturer is one of them.
    - Finds or creates a MaterialLot for the given lot_number.
    - Writes manufacturer/supplier to the lot (true traceability).
    - Inserts a StockTransaction with txn_type='RECEIPT', direction=+1.
    - Uses payload.receipt_date as StockTransaction.created_at.
    """

    # 1. Locate the material
    material = (
        db.query(Material)
        .filter(Material.material_code == payload.material_code)
        .one_or_none()
    )
    if material is None:
        raise HTTPException(status_code=404, detail="Material not found")

    # 2. For TABLETS_CAPSULES, enforce approved manufacturer list (if configured)
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

    # 3. Find or create the lot for this material + lot_number
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
            created_by=payload.created_by,
        )
        db.add(lot)
        db.flush()  # get lot.id
    else:
        # If an expiry date is supplied and different, update the lot
        if payload.expiry_date and lot.expiry_date != payload.expiry_date:
            lot.expiry_date = payload.expiry_date

        # If manufacturer/supplier provided and the lot doesn't have them yet,
        # set them (preserve existing values if already set).
        if payload.manufacturer and not lot.manufacturer:
            lot.manufacturer = payload.manufacturer
        if payload.supplier and not lot.supplier:
            lot.supplier = payload.supplier

    # 4. Optionally set default manufacturer/supplier on material only if blank
    if payload.manufacturer and not material.manufacturer:
        material.manufacturer = payload.manufacturer
    if payload.supplier and not material.supplier:
        material.supplier = payload.supplier

    # 5. Use the provided receipt_date as the transaction timestamp
    created_at = _normalise_receipt_datetime(payload.receipt_date)

    txn = StockTransaction(
        material_lot_id=lot.id,
        txn_type="RECEIPT",
        qty=payload.qty,
        uom_code=payload.uom_code,
        direction=1,
        unit_price=payload.unit_price,
        total_value=payload.total_value,
        target_ref=payload.target_ref,
        comment=payload.comment,
        product_manufacture_date=None,
        created_at=created_at,
        created_by=payload.created_by,
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
        # Show from lot first (true history), fall back to material if needed
        supplier=lot.supplier or material.supplier,
        manufacturer=lot.manufacturer or material.manufacturer,
        created_at=txn.created_at,
        created_by=txn.created_by,
        comment=txn.comment,
    )


@router.get("/", response_model=List[ReceiptOut])
def list_receipts(
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
) -> List[ReceiptOut]:
    """
    List the most recent goods receipts.

    "Goods Receipt Date" displayed in the UI is taken from
    StockTransaction.created_at, which we set from ReceiptCreate.receipt_date.
    """

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
                created_at=txn.created_at,
                created_by=txn.created_by,
                comment=txn.comment,
            )
        )

    return results
