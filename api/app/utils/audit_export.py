# api/app/utils/audit_export.py
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict, Any
import json

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session


def parse_iso_date_or_datetime(value: Optional[str]) -> Tuple[Optional[datetime], bool]:
    """
    Return (dt, is_date_only).

    - If value is None/empty: (None, False)
    - If value is YYYY-MM-DD: returns that date at 00:00:00 and is_date_only=True
    - Else tries datetime.fromisoformat and is_date_only=False
    """
    if value is None:
        return None, False

    v = value.strip()
    if not v:
        return None, False

    if len(v) == 10 and v[4] == "-" and v[7] == "-":
        try:
            d = datetime.strptime(v, "%Y-%m-%d")
            return d, True
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid date_from/date_to: {value}")

    try:
        if v.endswith("Z"):
            v = v[:-1] + "+00:00"
        dt = datetime.fromisoformat(v)
        return dt, False
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid ISO datetime: {value}")


def build_where_and_params(
    *,
    date_from: Optional[str],
    date_to: Optional[str],
    event_type: Optional[str],
    actor_username: Optional[str],
    target_type: Optional[str],
    q: Optional[str],
) -> Tuple[str, Dict[str, Any]]:
    where = []
    params: Dict[str, Any] = {}

    dt_from, _from_date_only = parse_iso_date_or_datetime(date_from)
    dt_to, to_date_only = parse_iso_date_or_datetime(date_to)

    if dt_from is not None:
        where.append("event_at >= :date_from")
        params["date_from"] = dt_from

    if dt_to is not None:
        if to_date_only:
            params["date_to"] = dt_to + timedelta(days=1)
            where.append("event_at < :date_to")
        else:
            params["date_to"] = dt_to
            where.append("event_at <= :date_to")

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
        where.append("(target_ref ILIKE :q OR reason ILIKE :q)")
        params["q"] = f"%{q}%"

    where_sql = ""
    if where:
        where_sql = "WHERE " + " AND ".join(where)

    return where_sql, params


def jsonify_cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False, separators=(",", ":"), default=str)
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v)


def fetch_export_rows(db: Session, where_sql: str, params: Dict[str, Any], limit: int):
    params2 = dict(params)
    params2["limit"] = limit
    stmt = text(
        f"""
        SELECT
          a.event_at,
          a.event_type,
          a.actor_username,
          u.role AS actor_role,
          a.target_type,
          a.target_ref,
          a.reason,
          a.before_json,
          a.after_json
        FROM audit_events_view a
        LEFT JOIN users u ON u.username = a.actor_username
        {where_sql}
        ORDER BY a.event_at DESC
        LIMIT :limit
        """
    )
    return db.execute(stmt, params2).mappings().all()
