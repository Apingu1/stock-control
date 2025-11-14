from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Material, MaterialLot, StockTransaction
from ..schemas import ReceiptCreate, ReceiptOut

router = APIRouter(prefix="/receipts", tags=["receipts"])


@router.post("/", response_model=ReceiptOut, status_code=201)
def create_receipt(body: ReceiptCreate, db: Session = Depends(get_db)):
    # 1) Look up the material by code (like your dropdown)
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
            status="QUARANTINE",  # default; QA can release later
            created_by=body.created_by,
        )
        db.add(lot)
        db.flush()  # assign lot.id

    # 3) Insert stock transaction for this receipt
    total_value = body.total_value
    if total_value is None and body.unit_price is not None:
        total_value = body.unit_price * body.qty

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
        created_by=body.created_by,
    )

    db.add(txn)
    db.commit()
    db.refresh(txn)

    return ReceiptOut(
        id=txn.id,
        material_code=material.material_code,
        lot_number=lot.lot_number,
        qty=txn.qty,
        uom_code=txn.uom_code,
        target_ref=txn.target_ref,
        created_at=txn.created_at,
        created_by=txn.created_by,
    )
