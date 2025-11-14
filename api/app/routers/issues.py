from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Material, MaterialLot, StockTransaction
from ..schemas import IssueCreate, IssueOut

router = APIRouter(prefix="/issues", tags=["issues"])


@router.post("/", response_model=IssueOut, status_code=201)
def create_issue(body: IssueCreate, db: Session = Depends(get_db)):
    # 1) Find material
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

    # 2) Find lot for that material + lot number
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
        raise HTTPException(
            status_code=400,
            detail=f"Unknown lot '{body.lot_number}' for material {body.material_code}",
        )

    # 3) Create a stock transaction with direction -1
    txn = StockTransaction(
        material_lot_id=lot.id,
        txn_type="ISSUE",
        qty=body.qty,
        uom_code=body.uom_code,
        direction=-1,
        unit_price=None,
        total_value=None,
        target_ref=body.product_batch_no,   # ES batch number
        comment=body.comment,
        created_by=body.created_by,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)

    return IssueOut(
        id=txn.id,
        material_code=material.material_code,
        lot_number=lot.lot_number,
        qty=txn.qty,
        uom_code=txn.uom_code,
        product_batch_no=body.product_batch_no,
        created_at=txn.created_at,
        created_by=txn.created_by,
    )
