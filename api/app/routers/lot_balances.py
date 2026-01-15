# app/routers/lot_balances.py
from typing import List, Optional
from datetime import datetime
import logging

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text, func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ..db import get_db
from ..schemas import LotBalanceOut, LotStatusChangeCreate
from ..models import MaterialLot, LotStatusChange, StockTransaction, Material, User, ExpiryThresholdSetting
from ..security import require_permission  # ✅ Phase B: permission guard (server enforced)

router = APIRouter(prefix="/lot-balances", tags=["lot-balances"])

logger = logging.getLogger(__name__)

ALLOWED_LOT_STATUSES = {"AVAILABLE", "QUARANTINE", "REJECTED"}

AUTO_QUARANTINE_REASON = "auto-quarantined due to low expiry"
AUTO_QUARANTINE_CHANGED_BY = "system"

STATUS_ALIASES = {
    "RELEASED": "AVAILABLE",
    "AVAIL": "AVAILABLE",
    "QUAR": "QUARANTINE",
}


def _normalise_status(s: Optional[str]) -> str:
    val = (s or "").strip().upper()
    return STATUS_ALIASES.get(val, val)


def _get_lot_balance(db: Session, lot_id: int) -> float:
    bal = (
        db.query(func.coalesce(func.sum(StockTransaction.qty * StockTransaction.direction), 0.0))
        .filter(StockTransaction.material_lot_id == lot_id)
        .scalar()
    )
    return float(bal or 0.0)


def _run_auto_quarantine_low_expiry(db: Session) -> None:
    """
    Phase D3:
    - Request-time auto-quarantine (no cron yet).
    - Idempotent: only processes AVAILABLE segments with positive balance.
    - Does NOT block issues in this phase.
    """
    candidates = (
        db.query(MaterialLot.id)
        .join(Material, Material.id == MaterialLot.material_id)
        .outerjoin(
            ExpiryThresholdSetting,
            (ExpiryThresholdSetting.category_code == Material.category_code)
            & (ExpiryThresholdSetting.type_code == Material.type_code)
            & (ExpiryThresholdSetting.is_active.is_(True)),
        )
        .filter(func.upper(MaterialLot.status) == "AVAILABLE")
        .filter(MaterialLot.expiry_date.isnot(None))
        .filter(
            (MaterialLot.expiry_date - func.current_date())
            <= func.coalesce(Material.auto_quarantine_override_days, ExpiryThresholdSetting.threshold_days)
        )
        .all()
    )

    if not candidates:
        return

    for (material_lot_id,) in candidates:
        try:
            lot = db.query(MaterialLot).filter(MaterialLot.id == material_lot_id).one_or_none()
            if lot is None:
                continue
            if _normalise_status(lot.status) != "AVAILABLE":
                continue

            bal = _get_lot_balance(db, lot.id)
            if bal <= 0:
                continue

            dest_lot = (
                db.query(MaterialLot)
                .filter(
                    MaterialLot.material_id == lot.material_id,
                    MaterialLot.lot_number == lot.lot_number,
                    func.upper(MaterialLot.status) == "QUARANTINE",
                    MaterialLot.id != lot.id,
                )
                .order_by(MaterialLot.id.asc())
                .first()
            )

            material = db.query(Material).filter(Material.id == lot.material_id).one()
            uom_code = material.base_uom_code
            reason_with_qty = f"{AUTO_QUARANTINE_REASON} | qty={bal} {uom_code}"

            if dest_lot:
                db.add(
                    StockTransaction(
                        material_lot_id=lot.id,
                        txn_type="STATUS_MOVE",
                        qty=bal,
                        uom_code=uom_code,
                        direction=-1,
                        comment=f"Moved {bal} {uom_code} from AVAILABLE to QUARANTINE. Reason: {AUTO_QUARANTINE_REASON}",
                        created_by=AUTO_QUARANTINE_CHANGED_BY,
                    )
                )
                db.add(
                    StockTransaction(
                        material_lot_id=dest_lot.id,
                        txn_type="STATUS_MOVE",
                        qty=bal,
                        uom_code=uom_code,
                        direction=+1,
                        comment=f"Received {bal} {uom_code} from AVAILABLE segment. Reason: {AUTO_QUARANTINE_REASON}",
                        created_by=AUTO_QUARANTINE_CHANGED_BY,
                    )
                )

                db.add(
                    LotStatusChange(
                        material_lot_id=lot.id,
                        old_status="AVAILABLE",
                        new_status="QUARANTINE",
                        reason=reason_with_qty,
                        changed_by=AUTO_QUARANTINE_CHANGED_BY,
                    )
                )
                db.add(
                    LotStatusChange(
                        material_lot_id=dest_lot.id,
                        old_status=_normalise_status(dest_lot.status),
                        new_status="QUARANTINE",
                        reason=f"Merged in qty={bal} {uom_code} from AVAILABLE. {AUTO_QUARANTINE_REASON}",
                        changed_by=AUTO_QUARANTINE_CHANGED_BY,
                    )
                )

                db.commit()
            else:
                db.add(
                    LotStatusChange(
                        material_lot_id=lot.id,
                        old_status="AVAILABLE",
                        new_status="QUARANTINE",
                        reason=reason_with_qty,
                        changed_by=AUTO_QUARANTINE_CHANGED_BY,
                    )
                )
                lot.status = "QUARANTINE"
                db.commit()

        except Exception as e:
            db.rollback()
            logger.exception(f"Auto-quarantine failed for material_lot_id={material_lot_id}: {e}")
            continue


@router.get("/", response_model=List[LotBalanceOut])
def list_lot_balances(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("lots.view")),  # ✅ Phase B: view permission
    material_code: Optional[str] = Query(None, description="Filter by material_code"),
    search: Optional[str] = Query(None, description="Search code/name/lot (ILIKE)"),
    include_zero: bool = Query(False, description="Include lots with zero balance"),
    limit: int = Query(200, ge=1, le=1000),
):
    _run_auto_quarantine_low_expiry(db)

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
            v.last_status_changed_at,
            v.lot_unit_price,
            v.lot_value,
            CASE WHEN v.expiry_date IS NULL THEN NULL ELSE (v.expiry_date::date - CURRENT_DATE)::int END AS days_to_expiry,
            COALESCE(m.auto_quarantine_override_days, s.threshold_days) AS expiry_threshold_days
        FROM lot_balances_view v
        LEFT JOIN materials m ON m.material_code = v.material_code
        LEFT JOIN expiry_threshold_settings s
          ON s.category_code = m.category_code
         AND s.type_code = m.type_code
         AND s.is_active = TRUE
        WHERE 1=1
    """

    params = {}

    if material_code:
        sql += " AND v.material_code = :material_code"
        params["material_code"] = material_code

    if not include_zero:
        sql += " AND v.balance_qty > 0"

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
            days_to_expiry=row.get("days_to_expiry"),
            expiry_threshold_days=row.get("expiry_threshold_days"),
            lot_unit_price=float(row["lot_unit_price"]) if row.get("lot_unit_price") is not None else None,
            lot_value=float(row["lot_value"]) if row.get("lot_value") is not None else None,
        )
        for row in rows
    ]


@router.post("/{material_lot_id}/status-change", response_model=LotBalanceOut)
def change_lot_status(
    material_lot_id: int,
    payload: LotStatusChangeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("lots.status_change")),  # ✅ Phase B permission
) -> LotBalanceOut:
    """
    Status change / merge logic:

    - If destination segment exists (same material+lot_number+target status), we ALWAYS do a STATUS_MOVE
      into the destination and drain the source.
    - IMPORTANT: When destination exists, we MUST NOT set lot.status = new_status (even for whole_lot),
      because it would violate the unique constraint (two segments with same status).
      The source segment is drained to 0 and will not appear in Live Lots (include_zero=False).
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

    current_balance = _get_lot_balance(db, lot.id)
    if current_balance <= 0:
        raise HTTPException(status_code=400, detail="Cannot change status: lot has zero balance")

    whole_lot = bool(payload.whole_lot)

    move_qty = payload.move_qty
    if not whole_lot and move_qty is None:
        raise HTTPException(status_code=400, detail="move_qty is required for partial status changes")

    if whole_lot:
        move_qty = current_balance

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

    base_reason = payload.reason.strip()
    changed_by = user.username

    material = db.query(Material).filter(Material.id == lot.material_id).one()
    uom_code = material.base_uom_code

    reason_with_qty = f"{base_reason} | qty={move_qty_f} {uom_code}"

    dest_statuses = [new_status]
    if new_status == "AVAILABLE":
        dest_statuses = ["AVAILABLE"]

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

    try:
        # --- Destination segment exists ------------------------------------------
        if dest_lot:
            db.add(
                StockTransaction(
                    material_lot_id=lot.id,
                    txn_type="STATUS_MOVE",
                    qty=move_qty_f,
                    uom_code=uom_code,
                    direction=-1,
                    comment=f"Moved {move_qty_f} {uom_code} from {old_status} to {new_status}. Reason: {base_reason}",
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
                    comment=f"Received {move_qty_f} {uom_code} from {old_status} segment. Reason: {base_reason}",
                    created_by=changed_by,
                )
            )

            # Keep status-change history (requested status change + merge)
            db.add(
                LotStatusChange(
                    material_lot_id=lot.id,
                    old_status=old_status,
                    new_status=new_status,
                    reason=reason_with_qty,
                    changed_by=changed_by,
                )
            )
            db.add(
                LotStatusChange(
                    material_lot_id=dest_lot.id,
                    old_status=_normalise_status(dest_lot.status),
                    new_status=new_status,
                    reason=f"Merged in qty={move_qty_f} {uom_code} from {old_status}. {base_reason}",
                    changed_by=changed_by,
                )
            )

            # ✅ CRITICAL FIX:
            # Do NOT set lot.status=new_status when dest exists (unique constraint).
            # We rely on STATUS_MOVE txns to drain source to 0.
            db.commit()

        # --- NO destination segment exists ---------------------------------------
        else:
            if whole_lot:
                db.add(
                    LotStatusChange(
                        material_lot_id=lot.id,
                        old_status=old_status,
                        new_status=new_status,
                        reason=reason_with_qty,
                        changed_by=changed_by,
                    )
                )
                lot.status = new_status
                db.commit()
            else:
                new_lot = MaterialLot(
                    material_id=lot.material_id,
                    lot_number=lot.lot_number,
                    expiry_date=lot.expiry_date,
                    status=new_status,
                )
                db.add(new_lot)
                db.flush()

                db.add(
                    StockTransaction(
                        material_lot_id=lot.id,
                        txn_type="STATUS_MOVE",
                        qty=move_qty_f,
                        uom_code=uom_code,
                        direction=-1,
                        comment=f"Moved {move_qty_f} {uom_code} from {old_status} to new {new_status} segment. Reason: {base_reason}",
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
                        comment=f"Received {move_qty_f} {uom_code} from {old_status} segment. Reason: {base_reason}",
                        created_by=changed_by,
                    )
                )
                db.add(
                    LotStatusChange(
                        material_lot_id=new_lot.id,
                        old_status=old_status,
                        new_status=new_status,
                        reason=reason_with_qty,
                        changed_by=changed_by,
                    )
                )

                db.commit()

    except IntegrityError as e:
        db.rollback()
        logger.exception(f"IntegrityError in status-change for lot_id={material_lot_id}: {e}")
        raise HTTPException(
            status_code=409,
            detail="Status-change merge failed due to a database constraint (duplicate status segment).",
        )
    except Exception as e:
        db.rollback()
        logger.exception(f"Status-change failed for lot_id={material_lot_id}: {e}")
        raise HTTPException(status_code=500, detail="Status-change failed (server error).")

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
                v.last_status_changed_at,
                v.lot_unit_price,
                v.lot_value
            FROM lot_balances_view v
            WHERE v.material_lot_id = :lot_id
            """
        ),
        {"lot_id": material_lot_id},
    ).mappings().one()

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
        lot_unit_price=float(row["lot_unit_price"]) if row.get("lot_unit_price") is not None else None,
        lot_value=float(row["lot_value"]) if row.get("lot_value") is not None else None,
    )
