from datetime import datetime, date, time
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Material, MaterialLot, StockTransaction
from ..schemas import ReceiptCreate, ReceiptOut

router = APIRouter(prefix="/receipts", tags=["receipts"])


def _normalise_receipt_datetime(value: datetime | date) -> datetime:
    """
    ReceiptCreate.receipt_date is declared as datetime, but in practice you
    often pass a date from the UI. This helper normalises either to a full
    datetime for created_at on the transaction.
    """
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    # Fallback – should not really happen if Pydantic is doing its job
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
    - Finds or creates a MaterialLot for the given lot_number.
    - Inserts a StockTransaction with txn_type='RECEIPT', direction=+1.
    - Uses payload.receipt_date as the StockTransaction.created_at, so the UI
      shows the actual receipt date instead of "record entry" timestamp.
    """

    # 1. Locate the material
    material = (
        db.query(Material)
        .filter(Material.material_code == payload.material_code)
        .one_or_none()
    )
    if material is None:
        raise HTTPException(status_code=404, detail="Material not found")

    # 2. Find or create the lot for this material + lot_number
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
            created_by=payload.created_by,
        )
        db.add(lot)
        db.flush()  # get lot.id
    else:
        # If an expiry date is supplied and different, update the lot
        if payload.expiry_date and lot.expiry_date != payload.expiry_date:
            lot.expiry_date = payload.expiry_date

    # 3. Optional: set "default" manufacturer/supplier on material only if blank
    # (this avoids overwriting historical suppliers/manufacturers every time)
    if payload.manufacturer and not material.manufacturer:
        material.manufacturer = payload.manufacturer
    if payload.supplier and not material.supplier:
        material.supplier = payload.supplier

    # 4. Use the provided receipt_date as the transaction timestamp
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
        # For raw-material receipts this is not applicable
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
        supplier=material.supplier,
        manufacturer=material.manufacturer,
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

    NOTE: The "Goods Receipt Date" displayed in the UI is taken from
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
                supplier=material.supplier,
                manufacturer=material.manufacturer,
                created_at=txn.created_at,
                created_by=txn.created_by,
                comment=txn.comment,
            )
        )

    return results
