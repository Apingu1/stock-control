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
        db.query(
            func.coalesce(func.sum(StockTransaction.qty * StockTransaction.direction), 0.0)
        )
        .filter(StockTransaction.material_lot_id == lot_id)
        .scalar()
    )
    return float(bal or 0.0)


def _normalise_status(s: Optional[str]) -> str:
    val = (s or "").strip().upper()
    return STATUS_ALIASES.get(val, val)


@router.post("/{material_lot_id}/status-change", response_model=LotBalanceOut)
def change_lot_status(
    material_lot_id: int,
    payload: LotStatusChangeCreate,
    db: Session = Depends(get_db),
) -> LotBalanceOut:
    """
    Whole lot:
      - If destination segment exists (same material_id + lot_number + status),
        MERGE by moving balance into destination via STATUS_MOVE.
      - Else flip MaterialLot.status.

    Partial quantity:
      - If destination segment exists, MERGE partial qty into destination via STATUS_MOVE.
      - Else create a new MaterialLot segment (same printed lot_number) and STATUS_MOVE into it.

    Never flips a segment into a status that already exists (prevents duplicates).
    """

    lot = db.query(MaterialLot).filter(MaterialLot.id == material_lot_id).one_or_none()
    if lot is None:
        raise HTTPException(status_code=404, detail="Lot not found")

    new_status = _normalise_status(payload.new_status)
    if new_status not in ALLOWED_LOT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid lot status")

    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="Reason is required")

    old_status = _normalise_status(lot.status)
    if new_status == old_status:
        raise HTTPException(status_code=400, detail="Status is already set to this value")

    # Current balance on this specific segment (material_lot_id)
    current_balance = _get_lot_balance(db, lot.id)
    if current_balance <= 0:
        raise HTTPException(status_code=400, detail="Cannot change status: lot has zero balance")

    # Determine whole vs partial
    whole_lot = bool(payload.whole_lot)

    move_qty = payload.move_qty
    if not whole_lot and move_qty is None:
        raise HTTPException(
            status_code=400, detail="move_qty is required for partial status changes"
        )

    if whole_lot:
        move_qty = current_balance

    # Validate qty
    try:
        move_qty_f = float(move_qty)
    except Exception:
        raise HTTPException(status_code=400, detail="move_qty must be a number")

    if move_qty_f <= 0:
        raise HTTPException(status_code=400, detail="move_qty must be > 0")

    if move_qty_f > current_balance:
        raise HTTPException(
            status_code=400,
            detail=f"move_qty exceeds current balance (balance {current_balance}, requested {move_qty_f})",
        )

    reason = payload.reason.strip()
    changed_by = (payload.changed_by or "").strip() or None

    # Need UOM from material master
    material = db.query(Material).filter(Material.id == lot.material_id).one()
    uom_code = material.base_uom_code

    # ---------------------------------------------------------------------
    # MERGE-AWARE destination lookup
    #
    # IMPORTANT: for AVAILABLE, also treat legacy RELEASED as equivalent
    # so the merge path triggers even if old data still has RELEASED.
    # ---------------------------------------------------------------------
    dest_statuses = [new_status]
    if new_status == "AVAILABLE":
        dest_statuses = ["AVAILABLE", "RELEASED"]

    dest_lot = (
        db.query(MaterialLot)
        .filter(
            MaterialLot.material_id == lot.material_id,
            MaterialLot.lot_number == lot.lot_number,
            MaterialLot.status.in_(dest_statuses),
            MaterialLot.id != lot.id,
        )
        .order_by(MaterialLot.id.asc())
        .first()
    )

    # --- MERGE path: destination segment already exists -----------------------
    if dest_lot is not None:
        # Move qty from source segment -> destination segment (whole or partial)
        db.add(
            StockTransaction(
                material_lot_id=lot.id,
                txn_type="STATUS_MOVE",
                qty=move_qty_f,
                uom_code=uom_code,
                direction=-1,
                comment=f"Moved {move_qty_f} to existing {new_status} segment. Reason: {reason}",
                created_by=changed_by,
            )
        )
        db.add(
            StockTransaction(
                material_lot_id=dest_lot.id,
                txn_type="STATUS_MOVE",
                qty=move_qty_f,
                uom_code=uom_code,
                direction=+1,
                comment=f"Received {move_qty_f} from {old_status} segment. Reason: {reason}",
                created_by=changed_by,
            )
        )

        # Log change against BOTH segments so the view shows last reason on both
        # (Your DB schema is old_status/new_status/reason/changed_by/changed_at)
        db.add(
            LotStatusChange(
                material_lot_id=lot.id,
                old_status=old_status,
                new_status=new_status,
                reason=reason,
                changed_by=changed_by,
            )
        )
        db.add(
            LotStatusChange(
                material_lot_id=dest_lot.id,
                old_status=_normalise_status(dest_lot.status),
                new_status=new_status,
                reason=f"Merged in {move_qty_f} from {old_status} segment. {reason}",
                changed_by=changed_by,
            )
        )

        # IMPORTANT: Do NOT flip lot.status (would create duplicate status segments)
        db.commit()

    # --- NO destination segment exists ---------------------------------------
    else:
        # Whole lot flip (safe because destination doesn't exist)
        if whole_lot:
            db.add(
                LotStatusChange(
                    material_lot_id=lot.id,
                    old_status=old_status,
                    new_status=new_status,
                    reason=reason,
                    changed_by=changed_by,
                )
            )
            lot.status = new_status
            db.commit()

        # Partial split: create a new segment lot and move qty into it
        else:
            new_lot = MaterialLot(
                material_id=lot.material_id,
                lot_number=lot.lot_number,
                expiry_date=lot.expiry_date,
                status=new_status,
                manufacturer=lot.manufacturer,
                supplier=lot.supplier,
                created_by=changed_by,
            )
            db.add(new_lot)
            db.flush()  # get new_lot.id

            db.add(
                StockTransaction(
                    material_lot_id=lot.id,
                    txn_type="STATUS_MOVE",
                    qty=move_qty_f,
                    uom_code=uom_code,
                    direction=-1,
                    comment=f"Moved {move_qty_f} to new {new_status} segment. Reason: {reason}",
                    created_by=changed_by,
                )
            )
            db.add(
                StockTransaction(
                    material_lot_id=new_lot.id,
                    txn_type="STATUS_MOVE",
                    qty=move_qty_f,
                    uom_code=uom_code,
                    direction=+1,
                    comment=f"Received {move_qty_f} from {old_status} segment. Reason: {reason}",
                    created_by=changed_by,
                )
            )

            db.add(
                LotStatusChange(
                    material_lot_id=lot.id,
                    old_status=old_status,
                    new_status=new_status,
                    reason=reason,
                    changed_by=changed_by,
                )
            )
            db.add(
                LotStatusChange(
                    material_lot_id=new_lot.id,
                    old_status=old_status,
                    new_status=new_status,
                    reason=reason,
                    changed_by=changed_by,
                )
            )

            db.commit()

    # Reload source row from view (UI should refetch list to see both rows)
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
