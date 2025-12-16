from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text, func
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import LotBalanceOut, LotStatusChangeCreate
from ..models import MaterialLot, LotStatusChange, StockTransaction, Material

router = APIRouter(prefix="/lot-balances", tags=["lot-balances"])

# Standardised status set (UI + DB)
ALLOWED_LOT_STATUSES = {"AVAILABLE", "QUARANTINE", "REJECTED"}

# Backward-compatible alias handling
STATUS_ALIASES = {
    "RELEASED": "AVAILABLE",
}


@router.get("/", response_model=List[LotBalanceOut])
def list_lot_balances(
    db: Session = Depends(get_db),
    material_code: Optional[str] = Query(
        None, description="Filter by material_code, e.g. MAT0327"
    ),
    search: Optional[str] = Query(
        None, description="Search by material code, name, or lot number (ILIKE)"
    ),
    include_zero: bool = Query(False, description="Include lots with zero balance"),
    limit: int = Query(200, ge=1, le=1000),
):
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

    sql += " ORDER BY v.material_code, v.lot_number, v.status LIMIT :limit"
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


def _get_lot_balance(db: Session, lot_id: int) -> float:
    bal = (
        db.query(func.coalesce(func.sum(StockTransaction.qty * StockTransaction.direction), 0.0))
        .filter(StockTransaction.material_lot_id == lot_id)
        .scalar()
    )
    return float(bal or 0.0)


@router.post("/{material_lot_id}/status-change", response_model=LotBalanceOut)
def change_lot_status(
    material_lot_id: int,
    payload: LotStatusChangeCreate,
    db: Session = Depends(get_db),
) -> LotBalanceOut:
    """
    Status change with support for:
    - Whole lot status change (no split)
    - Partial quantity move to new status (split lot)

    Rules:
    - Statuses standardised: AVAILABLE / QUARANTINE / REJECTED
    - "RELEASED" is accepted as alias -> AVAILABLE
    - Partial moves create a NEW MaterialLot row (same printed lot_number) and
      move qty via StockTransaction txn_type='STATUS_MOVE' to preserve auditability.
    """
    lot = db.query(MaterialLot).filter(MaterialLot.id == material_lot_id).one_or_none()
    if lot is None:
        raise HTTPException(status_code=404, detail="Lot not found")

    raw_status = (payload.new_status or "").strip().upper()
    new_status = STATUS_ALIASES.get(raw_status, raw_status)

    if new_status not in ALLOWED_LOT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid lot status")

    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="Reason is required")

    changed_by = (payload.changed_by or "").strip() or None

    current_balance = _get_lot_balance(db, lot.id)
    if current_balance <= 0:
        raise HTTPException(status_code=400, detail="Cannot change status: lot has zero balance")

    # Determine move quantity
    move_qty: Optional[float] = payload.move_qty
    whole_lot = bool(payload.whole_lot)

    # If user selected partial move, move_qty MUST be provided
    if not whole_lot and move_qty is None:
    raise HTTPException(status_code=400, detail="move_qty is required for partial status changes")

    # Whole lot = default to full balance
    if whole_lot:
    move_qty = current_balance


    if move_qty <= 0:
        raise HTTPException(status_code=400, detail="Move quantity must be > 0")

    if move_qty > current_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Move quantity exceeds balance (balance {current_balance}, requested {move_qty})",
        )

    # Material (for uom)
    material = db.query(Material).filter(Material.id == lot.material_id).one()
    uom_code = material.base_uom_code

    now = datetime.utcnow()

    # If moving the entire remaining balance, we can do a simple status flip.
    # (No need to create a split segment.)
    if abs(move_qty - current_balance) < 1e-9:
        old_status = (lot.status or "AVAILABLE").strip().upper()
        old_status = STATUS_ALIASES.get(old_status, old_status)

        if new_status == old_status:
            raise HTTPException(status_code=400, detail="Status is already set to this value")

        lot.status = new_status

        db.add(
            LotStatusChange(
                material_lot_id=lot.id,
                old_status=old_status,
                new_status=new_status,
                reason=payload.reason.strip(),
                changed_by=changed_by,
                changed_at=now,
            )
        )

        db.commit()

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
            raise HTTPException(status_code=500, detail="Failed to load updated lot balance")

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

    # Otherwise: partial move => split lot
    source_status = (lot.status or "AVAILABLE").strip().upper()
    source_status = STATUS_ALIASES.get(source_status, source_status)

    if new_status == source_status:
        raise HTTPException(status_code=400, detail="New status must be different for partial split")

    # Create new lot segment row (same printed lot_number)
    new_lot = MaterialLot(
        material_id=lot.material_id,
        lot_number=lot.lot_number,
        expiry_date=lot.expiry_date,
        manufacturer=lot.manufacturer,
        supplier=lot.supplier,
        status=new_status,
        created_by=changed_by,
    )
    db.add(new_lot)
    db.flush()  # get new_lot.id

    # Move stock between segments (audit-friendly, totals preserved)
    out_txn = StockTransaction(
        material_lot_id=lot.id,
        txn_type="STATUS_MOVE",
        qty=float(move_qty),
        uom_code=uom_code,
        direction=-1,
        unit_price=None,
        total_value=None,
        target_ref=None,
        product_batch_no=None,
        product_manufacture_date=None,
        comment=f"Moved {move_qty} to {new_status}. Reason: {payload.reason.strip()}",
        created_at=now,
        created_by=changed_by or "system",
    )
    in_txn = StockTransaction(
        material_lot_id=new_lot.id,
        txn_type="STATUS_MOVE",
        qty=float(move_qty),
        uom_code=uom_code,
        direction=+1,
        unit_price=None,
        total_value=None,
        target_ref=None,
        product_batch_no=None,
        product_manufacture_date=None,
        comment=f"Received {move_qty} from {source_status}. Reason: {payload.reason.strip()}",
        created_at=now,
        created_by=changed_by or "system",
    )

    db.add(out_txn)
    db.add(in_txn)

    # Log status change entries (so view can show last_status_reason/at per segment)
    db.add(
        LotStatusChange(
            material_lot_id=lot.id,
            old_status=source_status,
            new_status=source_status,
            reason=f"Split: moved {move_qty} to {new_status}. {payload.reason.strip()}",
            changed_by=changed_by,
            changed_at=now,
        )
    )
    db.add(
        LotStatusChange(
            material_lot_id=new_lot.id,
            old_status=source_status,
            new_status=new_status,
            reason=payload.reason.strip(),
            changed_by=changed_by,
            changed_at=now,
        )
    )

    db.commit()

    # Return the *source* lot row (UI will refetch list anyway)
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
        raise HTTPException(status_code=500, detail="Failed to load updated lot balance")

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
