# app/routers/receipts.py

from datetime import datetime, time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Material, MaterialLot, StockTransaction
from ..schemas import ReceiptCreate, ReceiptOut

router = APIRouter(prefix="/receipts", tags=["receipts"])


@router.post("/", response_model=ReceiptOut, status_code=201)
def create_receipt(
    body: ReceiptCreate,
    db: Session = Depends(get_db),
):
    """
    Create a goods receipt:

    - Find material by material_code (from the dropdown).
    - Find or create the lot for that material + lot_number.
    - Insert a stock transaction with txn_type='RECEIPT'.
    - Force created_at to match the *receipt_date* so the
      Goods Receipts page shows the true GRN date.
    """

    # 1) Look up the material by material_code
    material = (
        db.execute(
            select(Material).where(Material.material_code == body.material_code)
        )
        .scalar_one_or_none()
    )

    if not material:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown material_code: {body.material_code}",
        )

    # Keep master details in sync if provided
    if body.manufacturer:
        material.manufacturer = body.manufacturer
    if body.supplier:
        material.supplier = body.supplier
    if body.complies_es_criteria is not None:
        material.complies_es_criteria = body.complies_es_criteria

    # 2) Find or create lot for this material + batch no.
    lot = (
        db.execute(
            select(MaterialLot).where(
                MaterialLot.material_id == material.id,
                MaterialLot.lot_number == body.lot_number,
            )
        )
        .scalar_one_or_none()
    )

    if not lot:
        lot = MaterialLot(
            material_id=material.id,
            lot_number=body.lot_number,
            expiry_date=body.expiry_date,
            status="QUARANTINE",  # QA can release later
            created_by=body.created_by,
        )
        db.add(lot)
        db.flush()  # assign lot.id

    # 3) Work out the total_value
    total_value = body.total_value
    if total_value is None and body.unit_price is not None:
        total_value = body.unit_price * body.qty

    # 4) Derive created_at from receipt_date
    #    (so Receipts page shows actual GRN date, not "entry" date)
    if body.receipt_date is not None:
        created_at = datetime.combine(body.receipt_date, time.min)
    else:
        created_at = datetime.utcnow()

    # 5) Insert stock transaction for this receipt
    txn = StockTransaction(
        material_lot_id=lot.id,
        txn_type="RECEIPT",
        qty=body.qty,
        uom_code=body.uom_code,
        direction=+1,
        unit_price=body.unit_price,
        total_value=total_value,
        target_ref=body.target_ref,
        comment=body.comment,
        created_at=created_at,
        created_by=body.created_by,
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
    db: Session = Depends(get_db),
    material_code: Optional[str] = Query(
        None, description="Filter by material_code, e.g. MAT0327"
    ),
    lot_number: Optional[str] = Query(
        None, description="Filter by exact lot number"
    ),
    limit: int = Query(
        200,
        ge=1,
        le=2000,
        description="Max number of receipts to return (newest first).",
    ),
):
    """
    List historic goods receipts (stock_transactions with txn_type='RECEIPT'),
    joined to material + lot, mapped into ReceiptOut.
    """
    stmt = (
        select(StockTransaction, MaterialLot, Material)
        .join(MaterialLot, StockTransaction.material_lot_id == MaterialLot.id)
        .join(Material, MaterialLot.material_id == Material.id)
        .where(StockTransaction.txn_type == "RECEIPT")
        .order_by(StockTransaction.created_at.desc())
        .limit(limit)
    )

    if material_code:
        stmt = stmt.where(Material.material_code == material_code)
    if lot_number:
        stmt = stmt.where(MaterialLot.lot_number == lot_number)

    rows = db.execute(stmt).all()

    results: list[ReceiptOut] = []
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
