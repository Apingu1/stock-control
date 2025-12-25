# app/routers/issues.py
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Material, MaterialLot, StockTransaction, User
from ..schemas import IssueCreate, IssueOut
from ..security import require_permission

router = APIRouter(prefix="/issues", tags=["issues"])


@router.post("/", response_model=IssueOut, status_code=201)
def create_issue(
    payload: IssueCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("issues.create")),
) -> IssueOut:
    """
    Log a consumption / goods issue against a specific lot.

    Phase A:
    - Requires auth
    - created_by is enforced from authenticated user (server-side)

    Split-lots:
    - Prefer payload.material_lot_id
    - Fallback to (material_code + lot_number) ONLY if it resolves uniquely
    """
    created_by = user.username

    # 1. Locate material
    material = (
        db.query(Material)
        .filter(Material.material_code == payload.material_code)
        .one_or_none()
    )
    if material is None:
        raise HTTPException(status_code=404, detail="Material not found")

    # 2. Locate lot segment
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

    # 3. Check current balance for this lot segment
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

    # 4. Create issue transaction
    now = datetime.utcnow()

    txn = StockTransaction(
        material_lot_id=lot.id,
        txn_type="ISSUE",
        consumption_type=payload.consumption_type or "USAGE",
        qty=payload.qty,
        uom_code=payload.uom_code,
        direction=-1,
        unit_price=None,
        total_value=None,
        target_ref=payload.target_ref,
        product_batch_no=payload.product_batch_no,
        product_manufacture_date=payload.product_manufacture_date,
        comment=payload.comment,
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
        product_batch_no=txn.product_batch_no,
        manufacturer=manufacturer,
        supplier=supplier,
        product_manufacture_date=txn.product_manufacture_date,
        consumption_type=txn.consumption_type or "USAGE",
        target_ref=txn.target_ref,
        created_at=txn.created_at,
        created_by=txn.created_by or created_by,
        comment=txn.comment,
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
                product_batch_no=txn.product_batch_no,
                manufacturer=manufacturer,
                supplier=supplier,
                product_manufacture_date=txn.product_manufacture_date,
                consumption_type=txn.consumption_type or "USAGE",
                target_ref=txn.target_ref,
                created_at=txn.created_at,
                created_by=txn.created_by or "—",
                comment=txn.comment,
            )
        )

    return results
