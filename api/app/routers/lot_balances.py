from typing import List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import LotBalanceOut, LotStatusChangeCreate
from ..models import MaterialLot, LotStatusChange

router = APIRouter(prefix="/lot-balances", tags=["lot-balances"])

ALLOWED_LOT_STATUSES = {"QUARANTINE", "RELEASED", "REJECTED"}


@router.get("/", response_model=List[LotBalanceOut])
def list_lot_balances(
    db: Session = Depends(get_db),
    material_code: Optional[str] = Query(
        None, description="Filter by material_code, e.g. MAT0327"
    ),
    search: Optional[str] = Query(
        None, description="Search by material code, name, or lot number (ILIKE)"
    ),
    include_zero: bool = Query(
        False, description="Include lots with zero balance"
    ),
    limit: int = Query(200, ge=1, le=1000),
):
    # Use the lot_balances_view directly – it already joins materials
    sql = """
        SELECT
            v.material_lot_id,
            v.material_code,
            v.material_name,
            v.category_code,
            v.type_code,
            v.lot_number,
            v.expiry_date,
            v.status,
            v.manufacturer,
            v.supplier,
            v.balance_qty,
            v.uom_code,
            v.last_status_reason,
            v.last_status_changed_at
        FROM lot_balances_view v
        WHERE 1 = 1
    """
    params: dict = {}

    if not include_zero:
        sql += " AND v.balance_qty <> 0"

    if material_code:
        sql += " AND v.material_code = :material_code"
        params["material_code"] = material_code

    if search:
        sql += """
            AND (
                v.material_code ILIKE :search
                OR v.material_name ILIKE :search
                OR v.lot_number ILIKE :search
            )
        """
        params["search"] = f"%{search}%"

    sql += " ORDER BY v.material_code, v.lot_number LIMIT :limit"
    params["limit"] = limit

    rows = db.execute(text(sql), params).mappings().all()
    return [
        LotBalanceOut(
            material_lot_id=row["material_lot_id"],
            material_code=row["material_code"],
            material_name=row["material_name"],
            category_code=row["category_code"],
            type_code=row["type_code"],
            lot_number=row["lot_number"],
            expiry_date=row["expiry_date"],
            status=row["status"],
            manufacturer=row["manufacturer"],
            supplier=row["supplier"],
            balance_qty=row["balance_qty"],
            uom_code=row["uom_code"],
            last_status_reason=row.get("last_status_reason"),
            last_status_changed_at=row.get("last_status_changed_at"),
        )
        for row in rows
    ]


@router.post("/{material_lot_id}/status-change", response_model=LotBalanceOut)
def change_lot_status(
    material_lot_id: int,
    payload: LotStatusChangeCreate,
    db: Session = Depends(get_db),
) -> LotBalanceOut:
    """
    Change the status of a material lot and record a reason in lot_status_changes.
    Returns the updated row from lot_balances_view.
    """
    lot = (
        db.query(MaterialLot)
        .filter(MaterialLot.id == material_lot_id)
        .one_or_none()
    )
    if lot is None:
        raise HTTPException(status_code=404, detail="Lot not found")

    new_status = payload.new_status.strip().upper()
    if new_status not in ALLOWED_LOT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid lot status")

    if new_status == lot.status:
        raise HTTPException(
            status_code=400,
            detail="Status is already set to this value",
        )

    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="Reason is required")

    # Record the change
    status_change = LotStatusChange(
        material_lot_id=lot.id,
        old_status=lot.status,
        new_status=new_status,
        reason=payload.reason.strip(),
        changed_by=payload.changed_by,
    )

    lot.status = new_status
    db.add(status_change)
    db.commit()

    # Reload from view
    row = db.execute(
        text(
            """
            SELECT
                v.material_lot_id,
                v.material_code,
                v.material_name,
                v.category_code,
                v.type_code,
                v.lot_number,
                v.expiry_date,
                v.status,
                v.manufacturer,
                v.supplier,
                v.balance_qty,
                v.uom_code,
                v.last_status_reason,
                v.last_status_changed_at
            FROM lot_balances_view v
            WHERE v.material_lot_id = :lot_id
            """
        ),
        {"lot_id": lot.id},
    ).mappings().first()

    if row is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to load updated lot balance",
        )

    return LotBalanceOut(
        material_lot_id=row["material_lot_id"],
        material_code=row["material_code"],
        material_name=row["material_name"],
        category_code=row["category_code"],
        type_code=row["type_code"],
        lot_number=row["lot_number"],
        expiry_date=row["expiry_date"],
        status=row["status"],
        manufacturer=row["manufacturer"],
        supplier=row["supplier"],
        balance_qty=row["balance_qty"],
        uom_code=row["uom_code"],
        last_status_reason=row.get("last_status_reason"),
        last_status_changed_at=row.get("last_status_changed_at"),
    )
