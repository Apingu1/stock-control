from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import AuditEventOut
from ..security import require_permission
from ..models import User

router = APIRouter(prefix="/audit", tags=["audit"])


def _parse_iso_date_or_datetime(value: Optional[str]) -> Tuple[Optional[datetime], bool]:
    """
    Returns (datetime, is_date_only).

    Accepts:
      - YYYY-MM-DD
      - ISO datetime (with/without timezone), including trailing Z

    We treat YYYY-MM-DD as "date only".
    """
    if value is None:
        return None, False

    v = value.strip()
    if not v:
        return None, False

    # Date-only
    if len(v) == 10 and v[4] == "-" and v[7] == "-":
        try:
            d = datetime.strptime(v, "%Y-%m-%d")
            return d, True
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid date format for '{value}' (expected YYYY-MM-DD)")

    # Datetime (ISO)
    try:
        # Support Z suffix
        v2 = v.replace("Z", "+00:00")
        dt = datetime.fromisoformat(v2)
        return dt, False
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid datetime format for '{value}' (expected ISO datetime or YYYY-MM-DD)",
        )


@router.get("/events", response_model=List[AuditEventOut])
def get_audit_events(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("audit.view")),
    # NOTE: accept strings so we can distinguish date-only vs datetime
    date_from: Optional[str] = Query(None, description="ISO datetime or YYYY-MM-DD (inclusive)"),
    date_to: Optional[str] = Query(None, description="ISO datetime or YYYY-MM-DD (inclusive)"),
    event_type: Optional[str] = Query(None),
    actor_username: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Search target_ref and reason (ILIKE)"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """
    Read-only unified GMP audit feed.
    Data source: audit_events_view (append-only sources underneath).
    """
    where = []
    params = {"limit": limit, "offset": offset}

    dt_from, from_date_only = _parse_iso_date_or_datetime(date_from)
    dt_to, to_date_only = _parse_iso_date_or_datetime(date_to)

    # date_from: if date-only, inclusive from start of day
    if dt_from is not None:
        if from_date_only:
            # Already at 00:00:00
            pass
        where.append("event_at >= :date_from")
        params["date_from"] = dt_from

    # date_to:
    # - if date-only, include whole day by using < next_day
    # - if datetime, keep inclusive <=
    if dt_to is not None:
        if to_date_only:
            where.append("event_at < :date_to_excl")
            params["date_to_excl"] = dt_to + timedelta(days=1)
        else:
            where.append("event_at <= :date_to")
            params["date_to"] = dt_to

    if event_type:
        where.append("event_type = :event_type")
        params["event_type"] = event_type
    if actor_username:
        where.append("actor_username = :actor_username")
        params["actor_username"] = actor_username
    if target_type:
        where.append("target_type = :target_type")
        params["target_type"] = target_type
    if q:
        where.append("(COALESCE(target_ref,'') ILIKE :q OR COALESCE(reason,'') ILIKE :q)")
        params["q"] = f"%{q}%"

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    stmt = text(
        f"""
        SELECT
          event_type,
          event_at,
          actor_username,
          target_type,
          target_ref,
          reason,
          before_json,
          after_json
        FROM audit_events_view
        {where_sql}
        ORDER BY event_at DESC
        LIMIT :limit OFFSET :offset
        """
    )

    rows = db.execute(stmt, params).mappings().all()
    return [AuditEventOut(**dict(r)) for r in rows]
