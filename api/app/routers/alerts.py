from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AlertAction, User
from ..schemas import AlertActionOut, AlertActionUpsert
from ..security import require_permission


router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get(
    "/actions",
    response_model=List[AlertActionOut],
)
def list_alert_actions(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("alerts.view")),
    include_not_required: bool = Query(True, description="Include NOT_REQUIRED actions"),
):
    q = db.query(AlertAction)
    if not include_not_required:
        q = q.filter(AlertAction.state != "NOT_REQUIRED")
    rows = q.order_by(AlertAction.updated_at.desc()).all()
    return rows


@router.post(
    "/actions",
    response_model=AlertActionOut,
)
def upsert_alert_action(
    payload: AlertActionUpsert,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("alerts.manage")),
):
    # minimal validation (DB constraint also enforces)
    key = (payload.alert_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="alert_key is required")

    row = db.query(AlertAction).filter(AlertAction.alert_key == key).one_or_none()
    if row is None:
        row = AlertAction(
            alert_key=key,
            alert_type=(payload.alert_type or "").strip(),
            material_code=(payload.material_code or "").strip(),
            lot_number=(payload.lot_number or None),
            state=(payload.state or "").strip(),
            eta_text=payload.eta_text,
            last_seen_available_qty=payload.last_seen_available_qty,
            updated_by=user.username,
        )
        db.add(row)
    else:
        row.alert_type = (payload.alert_type or row.alert_type).strip()
        row.material_code = (payload.material_code or row.material_code).strip()
        row.lot_number = payload.lot_number
        row.state = (payload.state or row.state).strip()
        row.eta_text = payload.eta_text
        row.last_seen_available_qty = payload.last_seen_available_qty
        row.updated_by = user.username

    db.commit()
    db.refresh(row)
    return row


@router.delete("/actions")
def delete_alert_action(
    alert_key: str = Query(..., description="alert_key to delete"),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("alerts.manage")),
):
    key = (alert_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="alert_key is required")

    row = db.query(AlertAction).filter(AlertAction.alert_key == key).one_or_none()
    if row is None:
        return {"ok": True}

    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/prune")
def prune_alert_actions(
    active_keys: List[str] = Body(..., description="List of currently active alert keys"),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("alerts.manage")),
):
    """Prune resolved (non-suppressed) alert action rows.

    - Deletes rows where state != NOT_REQUIRED and alert_key is NOT in active_keys.
    - Keeps NOT_REQUIRED rows forever (suppression records), regardless of active_keys.
    """

    keys = []
    seen = set()
    for k in active_keys or []:
        kk = (k or "").strip()
        if not kk or kk in seen:
            continue
        seen.add(kk)
        keys.append(kk)

    q = db.query(AlertAction).filter(AlertAction.state != "NOT_REQUIRED")
    if keys:
        q = q.filter(~AlertAction.alert_key.in_(keys))

    deleted = q.delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted": int(deleted)}
