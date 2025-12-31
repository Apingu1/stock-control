from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import AuditEventOut
from ..security import require_permission
from ..models import User

from ..utils.audit_export import (
    build_where_and_params,
    fetch_export_rows,
    jsonify_cell,
    parse_iso_date_or_datetime,
)
from ..utils.audit_pdf import build_audit_pdf

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/events", response_model=List[AuditEventOut])
def get_audit_events(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("audit.view")),
    date_from: Optional[str] = Query(None, description="ISO datetime or YYYY-MM-DD (inclusive)"),
    date_to: Optional[str] = Query(None, description="ISO datetime or YYYY-MM-DD (inclusive)"),
    event_type: Optional[str] = Query(None),
    actor_username: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Search target_ref and reason (ILIKE)"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    where = []
    params = {"limit": limit, "offset": offset}

    dt_from, from_date_only = parse_iso_date_or_datetime(date_from)
    dt_to, to_date_only = parse_iso_date_or_datetime(date_to)

    if dt_from is not None:
        # date-only already at 00:00:00
        where.append("event_at >= :date_from")
        params["date_from"] = dt_from

    if dt_to is not None:
        # If date-only include whole day by < next_day. If datetime use <=
        if to_date_only:
            where.append("event_at < :date_to")
            # next day handled in audit_export util
            # Here reuse the same helper by calling build_where_and_params would be cleaner,
            # but keep minimal change to existing logic:
            from datetime import timedelta

            params["date_to"] = dt_to + timedelta(days=1)
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
        where.append("(target_ref ILIKE :q OR reason ILIKE :q)")
        params["q"] = f"%{q}%"

    where_sql = ""
    if where:
        where_sql = "WHERE " + " AND ".join(where)

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


@router.get("/events.csv")
def export_audit_events_csv(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("audit.view")),
    date_from: Optional[str] = Query(None, description="ISO datetime or YYYY-MM-DD (inclusive)"),
    date_to: Optional[str] = Query(None, description="ISO datetime or YYYY-MM-DD (inclusive)"),
    event_type: Optional[str] = Query(None),
    actor_username: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Search target_ref and reason (ILIKE)"),
    limit: int = Query(5000, ge=1, le=20000),
):
    where_sql, params = build_where_and_params(
        date_from=date_from,
        date_to=date_to,
        event_type=event_type,
        actor_username=actor_username,
        target_type=target_type,
        q=q,
    )
    rows = fetch_export_rows(db, where_sql, params, limit)

    def iter_csv():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(
            [
                "event_at",
                "event_type",
                "actor_username",
                "actor_role",
                "target_type",
                "target_ref",
                "reason",
                "before_json",
                "after_json",
            ]
        )
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)

        for r in rows:
            w.writerow(
                [
                    jsonify_cell(r.get("event_at")),
                    jsonify_cell(r.get("event_type")),
                    jsonify_cell(r.get("actor_username")),
                    jsonify_cell(r.get("actor_role")),
                    jsonify_cell(r.get("target_type")),
                    jsonify_cell(r.get("target_ref")),
                    jsonify_cell(r.get("reason")),
                    jsonify_cell(r.get("before_json")),
                    jsonify_cell(r.get("after_json")),
                ]
            )
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    headers = {"Content-Disposition": "attachment; filename=audit_events.csv"}
    return StreamingResponse(iter_csv(), media_type="text/csv; charset=utf-8", headers=headers)


@router.get("/events.pdf")
def export_audit_events_pdf(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("audit.view")),
    date_from: Optional[str] = Query(None, description="ISO datetime or YYYY-MM-DD (inclusive)"),
    date_to: Optional[str] = Query(None, description="ISO datetime or YYYY-MM-DD (inclusive)"),
    event_type: Optional[str] = Query(None),
    actor_username: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Search target_ref and reason (ILIKE)"),
    include_json: bool = Query(False, description="Include full before/after JSON appendix"),
    limit: int = Query(2000, ge=1, le=5000),
):
    where_sql, params = build_where_and_params(
        date_from=date_from,
        date_to=date_to,
        event_type=event_type,
        actor_username=actor_username,
        target_type=target_type,
        q=q,
    )
    rows = fetch_export_rows(db, where_sql, params, limit)

    filters_lines: List[str] = []
    if date_from:
        filters_lines.append(f"Date from: {date_from}")
    if date_to:
        filters_lines.append(f"Date to: {date_to}")
    if event_type:
        filters_lines.append(f"Event type: {event_type}")
    if actor_username:
        filters_lines.append(f"Actor: {actor_username}")
    if target_type:
        filters_lines.append(f"Target type: {target_type}")
    if q:
        filters_lines.append(f"Search: {q}")
    if not filters_lines:
        filters_lines.append("Filters: (none)")

    pdf_bytes = build_audit_pdf(
        system_name="Stock Control System",
        exported_by=user.username,
        exported_by_role=user.role,
        exported_at_utc=datetime.utcnow().isoformat() + "Z",
        filters_lines=filters_lines,
        rows=list(rows),
        include_json=include_json,
    )

    headers = {"Content-Disposition": "attachment; filename=audit_events.pdf"}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
