from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Material, MaterialLot, StockTransaction
from ..schemas import IssueCreate, IssueOut

router = APIRouter(prefix="/issues", tags=["issues"])


@router.post("/", response_model=IssueOut, status_code=201)
def create_issue(
    payload: IssueCreate,
    db: Session = Depends(get_db),
) -> IssueOut:
    """
    Log a consumption / goods issue against a specific lot.

    Behaviour:
    - Looks up Material by material_code.
    - Looks up (or creates) the MaterialLot for the given lot_number.
    - Checks there is enough stock in that lot (sum of qty * direction).
    - Inserts a StockTransaction with txn_type='ISSUE', direction=-1.
    - Uses 'now' as created_at (the IssueCreate payload does not carry an
      explicit issue_date; the consumption date is the time of entry).
    """

    # 1. Locate material
    material = (
        db.query(Material)
        .filter(Material.material_code == payload.material_code)
        .one_or_none()
    )
    if material is None:
        raise HTTPException(status_code=404, detail="Material not found")

    # 2. Locate (or create) lot
    lot = (
        db.query(MaterialLot)
        .filter(
            MaterialLot.material_id == material.id,
            MaterialLot.lot_number == payload.lot_number,
        )
        .one_or_none()
    )

    if lot is None:
        # Normally you should not be issuing from a lot that has never been
        # received, but we handle it defensively.
        lot = MaterialLot(
            material_id=material.id,
            lot_number=payload.lot_number,
            expiry_date=None,
            status="AVAILABLE",
            created_by=payload.created_by,
        )
        db.add(lot)
        db.flush()

    # 3. Check current balance for this lot
    current_balance = (
        db.query(
            func.coalesce(
                func.sum(StockTransaction.qty * StockTransaction.direction), 0.0
            )
        )
        .filter(StockTransaction.material_lot_id == lot.id)
        .scalar()
    )

    if current_balance < payload.qty:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient stock in lot {lot.lot_number} "
                f"(available {current_balance}, requested {payload.qty})"
            ),
        )

    # 4. Create issue transaction
    now = datetime.utcnow()

    txn = StockTransaction(
        material_lot_id=lot.id,
        txn_type="ISSUE",
        qty=payload.qty,
        uom_code=payload.uom_code,
        direction=-1,
        unit_price=None,
        total_value=None,
        target_ref=payload.target_ref,
        comment=payload.comment,
        product_manufacture_date=payload.product_manufacture_date,
        created_at=now,
        created_by=payload.created_by,
    )

    db.add(txn)
    db.commit()
    db.refresh(txn)
    db.refresh(lot)
    db.refresh(material)

    # NOTE: product_batch_no is *not* stored in the DB; we just echo it back
    # from the payload so the UI can show it in the immediate response.
    return IssueOut(
        id=txn.id,
        material_code=material.material_code,
        material_name=material.name,
        lot_number=lot.lot_number,
        expiry_date=lot.expiry_date,
        qty=txn.qty,
        uom_code=txn.uom_code,
        product_batch_no=payload.product_batch_no,
        manufacturer=material.manufacturer,
        supplier=material.supplier,
        product_manufacture_date=txn.product_manufacture_date,
        target_ref=txn.target_ref,
        created_at=txn.created_at,
        created_by=txn.created_by,
        comment=txn.comment,
    )


@router.get("/", response_model=List[IssueOut])
def list_issues(
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
) -> List[IssueOut]:
    """
    List recent consumption / issues.

    The UI shows:
    - Issue Date -> StockTransaction.created_at
    - Product Manufacture Date -> StockTransaction.product_manufacture_date
    """

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
        results.append(
            IssueOut(
                id=txn.id,
                material_code=material.material_code,
                material_name=material.name,
                lot_number=lot.lot_number,
                expiry_date=lot.expiry_date,
                qty=txn.qty,
                uom_code=txn.uom_code,
                # Historical issues won't have product_batch_no stored
                product_batch_no=None,
                manufacturer=material.manufacturer,
                supplier=material.supplier,
                product_manufacture_date=txn.product_manufacture_date,
                target_ref=txn.target_ref,
                created_at=txn.created_at,
                created_by=txn.created_by,
                comment=txn.comment,
            )
        )

    return results
