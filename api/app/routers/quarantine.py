from __future__ import annotations

import re
import csv
import io
from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    LotStatusChange,
    Material,
    MaterialLot,
    QuarantineEvent,
    QuarantinePolicySetting,
    StockTransaction,
    User,
)
from ..schemas import QuarantineLogRow, QuarantinePolicyOut, QuarantinePolicyUpdate
from ..security import require_admin_access, require_permission
from ..utils.quarantine_pdf import build_quarantine_log_pdf

router = APIRouter(prefix="/quarantine", tags=["quarantine"])


# ---------------------------------------------------------------------------
# Policy (singleton)
# ---------------------------------------------------------------------------

@router.get("/policy", response_model=QuarantinePolicyOut)
def get_policy(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_access),
) -> QuarantinePolicyOut:
    row = db.query(QuarantinePolicySetting).filter(QuarantinePolicySetting.id == 1).one_or_none()
    if row is None:
        row = QuarantinePolicySetting(id=1, allow_issue_from_quarantine=True, updated_by=admin.username)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.put("/policy", response_model=QuarantinePolicyOut)
def update_policy(
    payload: QuarantinePolicyUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_access),
) -> QuarantinePolicyOut:
    row = db.query(QuarantinePolicySetting).filter(QuarantinePolicySetting.id == 1).one_or_none()
    if row is None:
        row = QuarantinePolicySetting(id=1, allow_issue_from_quarantine=True)
        db.add(row)
        db.flush()

    row.allow_issue_from_quarantine = bool(payload.allow_issue_from_quarantine)
    row.updated_by = admin.username
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Quarantine log
# ---------------------------------------------------------------------------

_QTY_RE = re.compile(r"qty\s*=\s*([0-9]+(?:\.[0-9]+)?)", re.IGNORECASE)


def _qty_from_reason(reason: str) -> Optional[Decimal]:
    if not reason:
        return None
    m = _QTY_RE.search(reason)
    if not m:
        return None
    try:
        return Decimal(m.group(1))
    except Exception:
        return None


def _sig(
    event_type: str,
    event_at: datetime,
    source_lot_id: Optional[int],
    dest_lot_id: Optional[int],
    qty: Optional[Decimal],
    from_status: Optional[str],
    to_status: Optional[str],
    created_by: Optional[str],
) -> Tuple:
    # round to second to make dedupe resilient
    ts = event_at.replace(microsecond=0) if event_at else None
    q = (qty.quantize(Decimal("0.000001")) if isinstance(qty, Decimal) else qty)
    return (event_type, ts, source_lot_id, dest_lot_id, q, from_status, to_status, created_by)


@router.get("/log", response_model=List[QuarantineLogRow])
def quarantine_log(
    limit: int = Query(400, ge=50, le=5000),
    event_type: Optional[str] = Query(None, description="STATUS_CHANGE | DESTRUCTION"),
    q: Optional[str] = Query(None, description="Search filter (material/lot/user/reason)"),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("lots.status_change")),
) -> List[QuarantineLogRow]:
    """
    Returns a merged quarantine activity log.

    - STATUS_CHANGE: quarantine-related status changes (QUARANTINE ↔ AVAILABLE).
      Uses QuarantineEvent rows where available, otherwise derives from LotStatusChange (legacy).
    - DESTRUCTION: ALL destruction issues (ISSUE rows where consumption_type='DESTRUCTION').
      Uses QuarantineEvent rows where available, otherwise derives from StockTransaction (legacy).

    NOTE: We keep existing system behaviour intact and only add structured logging.
    """
    et = event_type.strip().upper() if event_type else None
    if et and et not in ("STATUS_CHANGE", "DESTRUCTION"):
        raise HTTPException(status_code=400, detail="Invalid event_type")

    search = (q or "").strip().lower()

    out: List[QuarantineLogRow] = []

    # --- 1) Recorded (structured) events -------------------------------------
    qev_stmt = (
        select(QuarantineEvent, MaterialLot, Material)
        .join(MaterialLot, QuarantineEvent.material_lot_id == MaterialLot.id)
        .join(Material, MaterialLot.material_id == Material.id)
        .order_by(QuarantineEvent.event_at.desc())
        .limit(limit)
    )
    if et:
        qev_stmt = qev_stmt.where(QuarantineEvent.event_type == et)

    qev_rows = db.execute(qev_stmt).all()

    sigs = set()
    for ev, lot, mat in qev_rows:
        row = QuarantineLogRow(
            id=f"QEV-{ev.id}",
            event_at=ev.event_at,
            event_type=ev.event_type,
            material_code=mat.material_code,
            material_name=mat.name,
            lot_number=lot.lot_number,
            qty=ev.qty,
            uom_code=ev.uom_code or mat.base_uom_code,
            from_status=ev.from_status,
            to_status=ev.to_status,
            reason=ev.reason,
            created_by=ev.created_by,
            source_material_lot_id=ev.material_lot_id,
            dest_material_lot_id=ev.dest_material_lot_id,
            source=ev.source or "RECORDED",
        )
        if search:
            hay = f"{row.material_code} {row.material_name or ''} {row.lot_number} {row.reason or ''} {row.created_by or ''}".lower()
            if search not in hay:
                continue

        out.append(row)
        sigs.add(_sig(ev.event_type, ev.event_at, ev.material_lot_id, ev.dest_material_lot_id, ev.qty, ev.from_status, ev.to_status, ev.created_by))

    # Helper for adding derived rows with dedupe + search
    def add_if_new(row: QuarantineLogRow, sig: Tuple):
        if sig in sigs:
            return
        if search:
            hay = f"{row.material_code} {row.material_name or ''} {row.lot_number} {row.reason or ''} {row.created_by or ''}".lower()
            if search not in hay:
                return
        sigs.add(sig)
        out.append(row)

    # --- 2) Derived: ALL destruction issues ----------------------------------
    if et in (None, "DESTRUCTION"):
        destr_stmt = (
            select(StockTransaction, MaterialLot, Material)
            .join(MaterialLot, StockTransaction.material_lot_id == MaterialLot.id)
            .join(Material, MaterialLot.material_id == Material.id)
            .where(StockTransaction.txn_type == "ISSUE")
            .where(func.upper(func.coalesce(StockTransaction.consumption_type, "USAGE")) == "DESTRUCTION")
            .order_by(StockTransaction.created_at.desc())
            .limit(limit)
        )

        for txn, lot, mat in db.execute(destr_stmt).all():
            qty = txn.qty if isinstance(txn.qty, Decimal) else Decimal(str(txn.qty))
            qty = abs(qty)

            row = QuarantineLogRow(
                id=f"ISSUE-DESTR-{txn.id}",
                event_at=txn.created_at,
                event_type="DESTRUCTION",
                material_code=mat.material_code,
                material_name=mat.name,
                lot_number=lot.lot_number,
                qty=qty,
                uom_code=txn.uom_code or mat.base_uom_code,
                from_status=txn.material_status_at_txn,
                to_status="DESTROYED",
                reason=txn.comment or txn.target_ref or "Destruction consumption",
                created_by=txn.created_by,
                source_material_lot_id=txn.material_lot_id,
                dest_material_lot_id=None,
                source="DERIVED",
            )

            add_if_new(
                row,
                _sig("DESTRUCTION", txn.created_at, txn.material_lot_id, None, qty, txn.material_status_at_txn, "DESTROYED", txn.created_by),
            )

    # --- 3) Derived: quarantine-related status changes (legacy) --------------
    if et in (None, "STATUS_CHANGE"):
        sc_stmt = (
            select(LotStatusChange, MaterialLot, Material)
            .join(MaterialLot, LotStatusChange.material_lot_id == MaterialLot.id)
            .join(Material, MaterialLot.material_id == Material.id)
            .where((func.upper(LotStatusChange.old_status) == "QUARANTINE") | (func.upper(LotStatusChange.new_status) == "QUARANTINE"))
            .order_by(LotStatusChange.changed_at.desc())
            .limit(limit)
        )

        for sc, lot, mat in db.execute(sc_stmt).all():
            qty = _qty_from_reason(sc.reason) or Decimal("0")
            row = QuarantineLogRow(
                id=f"LSC-{sc.id}",
                event_at=sc.changed_at,
                event_type="STATUS_CHANGE",
                material_code=mat.material_code,
                material_name=mat.name,
                lot_number=lot.lot_number,
                qty=qty,
                uom_code=mat.base_uom_code,
                from_status=sc.old_status,
                to_status=sc.new_status,
                reason=sc.reason,
                created_by=sc.changed_by,
                source_material_lot_id=sc.material_lot_id,
                dest_material_lot_id=None,
                source="DERIVED",
            )

            add_if_new(
                row,
                _sig("STATUS_CHANGE", sc.changed_at, sc.material_lot_id, None, qty, sc.old_status, sc.new_status, sc.changed_by),
            )

    # sort merged list (recorded + derived)
    out.sort(key=lambda r: r.event_at, reverse=True)
    return out[:limit]


# ---------------------------------------------------------------------------
# Exports (CSV + PDF) - additive
# ---------------------------------------------------------------------------

def _csv_cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v)


@router.get("/log.csv")
def quarantine_log_csv(
    limit: int = Query(5000, ge=50, le=20000),
    event_type: Optional[str] = Query(None, description="STATUS_CHANGE | DESTRUCTION"),
    q: Optional[str] = Query(None, description="Search filter (material/lot/user/reason)"),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("lots.status_change")),
):
    # IMPORTANT: reuse existing logic exactly, so export matches UI
    rows = quarantine_log(limit=limit, event_type=event_type, q=q, db=db, _=user)

    def iter_csv():
        buf = io.StringIO()
        w = csv.writer(buf)

        w.writerow(
            [
                "event_at",
                "event_type",
                "material_code",
                "material_name",
                "lot_number",
                "qty",
                "uom_code",
                "from_status",
                "to_status",
                "reason",
                "created_by",
                "source_material_lot_id",
                "dest_material_lot_id",
            ]
        )
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)

        for r in rows:
            w.writerow(
                [
                    _csv_cell(r.event_at),
                    _csv_cell(r.event_type),
                    _csv_cell(r.material_code),
                    _csv_cell(r.material_name),
                    _csv_cell(r.lot_number),
                    _csv_cell(r.qty),
                    _csv_cell(r.uom_code),
                    _csv_cell(r.from_status),
                    _csv_cell(r.to_status),
                    _csv_cell(r.reason),
                    _csv_cell(r.created_by),
                    _csv_cell(r.source_material_lot_id),
                    _csv_cell(r.dest_material_lot_id),
                ]
            )
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    headers = {"Content-Disposition": "attachment; filename=quarantine_log.csv"}
    return StreamingResponse(iter_csv(), media_type="text/csv; charset=utf-8", headers=headers)


@router.get("/log.pdf")
def quarantine_log_pdf(
    limit: int = Query(2000, ge=50, le=5000),
    event_type: Optional[str] = Query(None, description="STATUS_CHANGE | DESTRUCTION"),
    q: Optional[str] = Query(None, description="Search filter (material/lot/user/reason)"),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("lots.status_change")),
):
    # IMPORTANT: reuse existing logic exactly, so export matches UI
    rows = quarantine_log(limit=limit, event_type=event_type, q=q, db=db, _=user)

    filters_lines: List[str] = []
    if event_type:
        filters_lines.append(f"Event type: {event_type}")
    if q:
        filters_lines.append(f"Search: {q}")
    filters_lines.append(f"Limit: {limit}")

    pdf_bytes = build_quarantine_log_pdf(
        system_name="Stock Control System",
        exported_by=user.username,
        exported_by_role=getattr(user, "role", "—") or "—",
        exported_at_utc=datetime.utcnow().isoformat() + "Z",
        filters_lines=filters_lines,
        rows=rows,
    )

    headers = {"Content-Disposition": "attachment; filename=quarantine_log.pdf"}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
