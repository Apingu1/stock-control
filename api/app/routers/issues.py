from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
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
        # ⭐ store the ES batch manufacture date (can be None)
        product_manufacture_date=body.product_manufacture_date,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)

    return IssueOut(
        id=txn.id,
        material_code=material.material_code,
        material_name=material.name,
        lot_number=lot.lot_number,
        expiry_date=lot.expiry_date,
        qty=txn.qty,
        uom_code=txn.uom_code,
        product_batch_no=body.product_batch_no,
        manufacturer=material.manufacturer,
        supplier=material.supplier,
        product_manufacture_date=txn.product_manufacture_date,
        created_at=txn.created_at,
        created_by=txn.created_by,
        comment=txn.comment,
    )


@router.get("/", response_model=List[IssueOut])
def list_issues(
    db: Session = Depends(get_db),
    material_code: Optional[str] = Query(
        None, description="Filter by material_code, e.g. MAT0327"
    ),
    lot_number: Optional[str] = Query(
        None, description="Filter by exact lot number"
    ),
    product_batch_no: Optional[str] = Query(
        None, description="Filter by ES product batch (target_ref)"
    ),
    limit: int = Query(
        200,
        ge=1,
        le=2000,
        description="Max number of issues to return (newest first).",
    ),
):
    """
    List historic consumption transactions (txn_type='ISSUE'),
    joined to material + lot, mapped into IssueOut.
    """
    stmt = (
        select(StockTransaction, MaterialLot, Material)
        .join(MaterialLot, StockTransaction.material_lot_id == MaterialLot.id)
        .join(Material, MaterialLot.material_id == Material.id)
        .where(StockTransaction.txn_type == "ISSUE")
        .order_by(StockTransaction.created_at.desc())
        .limit(limit)
    )

    if material_code:
        stmt = stmt.where(Material.material_code == material_code)
    if lot_number:
        stmt = stmt.where(MaterialLot.lot_number == lot_number)
    if product_batch_no:
        stmt = stmt.where(StockTransaction.target_ref == product_batch_no)

    rows = db.execute(stmt).all()

    results: list[IssueOut] = []
    for txn, lot, material in rows:
        results.append(
            IssueOut(
                id=txn.id,
                material_code=material.material_code,
                material_name=material.name,
                lot_number=lot.lot_number,
                expiry_date=lot.expiry_date,
                qty=txn.qty,
                uom_code=txn.uom_code,
                product_batch_no=txn.target_ref or "",
                manufacturer=material.manufacturer,
                supplier=material.supplier,
                product_manufacture_date=txn.product_manufacture_date,
                created_at=txn.created_at,
                created_by=txn.created_by,
                comment=txn.comment,
            )
        )

    return results
