from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User  # matches your other routers


router = APIRouter(prefix="/analytics", tags=["analytics"])

# --- Import underlying helpers from your existing security layer ---
from ..security import get_current_user, user_has_permission  # noqa: E402


def require_any_permission(*permission_keys: str):
    """
    Dependency: allow if the user has ANY of the provided permissions.
    """
    def _dep(
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> User:
        for key in permission_keys:
            if user_has_permission(db=db, user=user, permission_key=key):
                return user
        raise HTTPException(
            status_code=403,
            detail=f"Missing permission (any of): {', '.join(permission_keys)}",
        )

    return _dep


# --- Date helpers (Europe/London day boundaries) ---
LONDON_TZ = ZoneInfo("Europe/London")


def _parse_ymd(d: str) -> date:
    try:
        return date.fromisoformat(d)  # expects YYYY-MM-DD
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid date '{d}'. Expected YYYY-MM-DD.") from e


def london_day_bounds_utc(
    date_from: Optional[str],
    date_to: Optional[str],
) -> tuple[Optional[datetime], Optional[datetime]]:
    """Convert YYYY-MM-DD to UTC datetimes for start/end of day in Europe/London."""
    start_utc: Optional[datetime] = None
    end_utc: Optional[datetime] = None

    if date_from:
        d0 = _parse_ymd(date_from)
        start_local = datetime.combine(d0, time.min).replace(tzinfo=LONDON_TZ)
        start_utc = start_local.astimezone(timezone.utc)

    if date_to:
        d1 = _parse_ymd(date_to)
        end_local = datetime.combine(d1, time.max).replace(tzinfo=LONDON_TZ)
        end_utc = end_local.astimezone(timezone.utc)

    if start_utc and end_utc and end_utc < start_utc:
        raise HTTPException(status_code=400, detail="date_to must be on or after date_from")

    return start_utc, end_utc


# --- DB helpers ---
def rows(db: Session, sql: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    res = db.execute(text(sql), params or {})
    cols = list(res.keys())
    out: List[Dict[str, Any]] = []
    for r in res.fetchall():
        out.append({cols[i]: r[i] for i in range(len(cols))})
    return out


def one(db: Session, sql: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    res = db.execute(text(sql), params or {})
    row = res.fetchone()
    if row is None:
        return {}
    cols = list(res.keys())
    return {cols[i]: row[i] for i in range(len(cols))}


@router.get("/dashboard")
def dashboard(
    top_n: int = Query(10, ge=1, le=50),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    """
    Legacy (no date range):
      - Monthly KPIs from analytics_monthly_kpis
      - Top products from analytics_product_batch_frequency (top_n)

    Range mode (date_from/date_to provided):
      - KPI totals within the date range from stock_transactions
      - Grouped analytics by product AND by material (all rows in range)
      - Monthly buckets within the range (derived from stock_transactions)
    """
    try:
        start_utc, end_utc = london_day_bounds_utc(date_from, date_to)
        range_mode = bool(start_utc or end_utc)

        if not range_mode:
            monthly = rows(
                db,
                """
                SELECT
                  month_bucket,
                  receipt_total_value,
                  issue_total_value,
                  receipt_txn_count,
                  issue_txn_count,
                  unique_batches_issued
                FROM analytics_monthly_kpis
                ORDER BY month_bucket;
                """
            )

            top_products = rows(
                db,
                """
                SELECT
                  es_product_code,
                  unique_batch_count,
                  last_issue_at
                FROM analytics_product_batch_frequency
                ORDER BY unique_batch_count DESC, es_product_code ASC
                LIMIT :top_n;
                """,
                {"top_n": top_n},
            )

            payload = {
                "meta": {
                    "data_cut": datetime.utcnow().isoformat(),
                    "timezone_month_bucket": "Europe/London",
                    "logic_version": "analytics_v1_views",
                },
                "monthly": monthly,
                "top_products": top_products,
            }
            return jsonable_encoder(payload)

        params: Dict[str, Any] = {"start_utc": start_utc, "end_utc": end_utc}

        where_parts = ["1=1"]
        if start_utc is not None:
            where_parts.append("st.created_at >= :start_utc")
        if end_utc is not None:
            where_parts.append("st.created_at <= :end_utc")
        where_sql = " AND ".join(where_parts)

        kpis = one(
            db,
            f"""
            SELECT
              COALESCE(SUM(CASE WHEN st.txn_type='RECEIPT' THEN st.total_value ELSE 0 END),0)::numeric AS receipt_total_value,
              COALESCE(SUM(CASE WHEN st.txn_type='ISSUE' THEN st.total_value ELSE 0 END),0)::numeric AS issue_total_value,
              COUNT(*) FILTER (WHERE st.txn_type='RECEIPT')::int AS receipt_txn_count,
              COUNT(*) FILTER (WHERE st.txn_type='ISSUE')::int AS issue_txn_count,
              COUNT(DISTINCT st.product_batch_no) FILTER (WHERE st.txn_type='ISSUE' AND st.product_batch_no IS NOT NULL)::int AS unique_batches_issued
            FROM stock_transactions st
            WHERE {where_sql};
            """,
            params,
        )

        by_product = rows(
            db,
            f"""
            SELECT
              st.es_product_code,
              COUNT(DISTINCT st.product_batch_no)::int AS unique_batches,
              COALESCE(SUM(st.total_value),0)::numeric AS total_cost,
              CASE
                WHEN COUNT(DISTINCT st.product_batch_no) = 0 THEN 0
                ELSE COALESCE(SUM(st.total_value),0) / COUNT(DISTINCT st.product_batch_no)
              END::numeric AS avg_cost_per_batch,
              COUNT(*)::int AS issue_txn_count,
              MIN(st.created_at) AS first_issue_at,
              MAX(st.created_at) AS last_issue_at
            FROM stock_transactions st
            WHERE {where_sql}
              AND st.txn_type='ISSUE'
              AND st.es_product_code IS NOT NULL
              AND st.product_batch_no IS NOT NULL
            GROUP BY st.es_product_code
            ORDER BY unique_batches DESC, st.es_product_code ASC;
            """,
            params,
        )

        # ✅ FIXED: material_code resolved via st.material_lot_id -> material_lots -> materials
        by_material = rows(
            db,
            """
            SELECT
              m.material_code,
              m.name AS material_name,
              m.base_uom_code AS uom_code,

              COUNT(DISTINCT st.product_batch_no) FILTER (WHERE st.product_batch_no IS NOT NULL)::int AS unique_batches,
              COALESCE(SUM(st.total_value),0)::numeric AS total_cost,
              CASE
                WHEN COUNT(DISTINCT st.product_batch_no) FILTER (WHERE st.product_batch_no IS NOT NULL) = 0 THEN 0
                ELSE COALESCE(SUM(st.total_value),0)
                     / COUNT(DISTINCT st.product_batch_no) FILTER (WHERE st.product_batch_no IS NOT NULL)
              END::numeric AS avg_cost_per_batch,

              COALESCE(SUM(st.qty),0)::numeric AS issue_qty_total,
              COUNT(*)::int AS issue_txn_count,
              MIN(st.created_at) AS first_issue_at,
              MAX(st.created_at) AS last_issue_at
            FROM stock_transactions st
            JOIN material_lots ml ON ml.id = st.material_lot_id
            JOIN materials m ON m.id = ml.material_id
            WHERE st.txn_type='ISSUE'
              AND (:start_utc IS NULL OR st.created_at >= :start_utc)
              AND (:end_utc IS NULL OR st.created_at <= :end_utc)
            GROUP BY m.material_code, m.name, m.base_uom_code
            ORDER BY unique_batches DESC, m.material_code ASC;
            """,
            params,
        )

        monthly = rows(
            db,
            f"""
            SELECT
              date_trunc('month', (st.created_at AT TIME ZONE 'Europe/London'))::date AS month_bucket,
              COALESCE(SUM(CASE WHEN st.txn_type='RECEIPT' THEN st.total_value ELSE 0 END),0)::numeric AS receipt_total_value,
              COALESCE(SUM(CASE WHEN st.txn_type='ISSUE' THEN st.total_value ELSE 0 END),0)::numeric AS issue_total_value,
              COUNT(*) FILTER (WHERE st.txn_type='RECEIPT')::int AS receipt_txn_count,
              COUNT(*) FILTER (WHERE st.txn_type='ISSUE')::int AS issue_txn_count,
              COUNT(DISTINCT st.product_batch_no) FILTER (WHERE st.txn_type='ISSUE' AND st.product_batch_no IS NOT NULL)::int AS unique_batches_issued
            FROM stock_transactions st
            WHERE {where_sql}
            GROUP BY 1
            ORDER BY 1;
            """,
            params,
        )

        payload = {
            "meta": {
                "data_cut": datetime.utcnow().isoformat(),
                "timezone_day_bounds": "Europe/London",
                "logic_version": "analytics_v1_range_stock_transactions",
            },
            "range": {"date_from": date_from, "date_to": date_to},
            "kpis": kpis,
            "by_product": by_product,
            "by_material": by_material,
            "monthly": monthly,
        }
        return jsonable_encoder(payload)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics dashboard failed: {type(e).__name__}: {e}")


@router.get("/products/{product_code}/summary")
def product_summary(
    product_code: str,
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    try:
        start_utc, end_utc = london_day_bounds_utc(date_from, date_to)
        params: Dict[str, Any] = {"product_code": product_code, "start_utc": start_utc, "end_utc": end_utc}

        where_parts = [
            "txn_type='ISSUE'",
            "es_product_code = :product_code",
            "product_batch_no IS NOT NULL",
        ]
        if start_utc is not None:
            where_parts.append("created_at >= :start_utc")
        if end_utc is not None:
            where_parts.append("created_at <= :end_utc")
        where_sql = " AND ".join(where_parts)

        payload = one(
            db,
            f"""
            SELECT
              :product_code AS es_product_code,
              COUNT(DISTINCT product_batch_no)::int AS unique_batches,
              COALESCE(SUM(total_value),0)::numeric AS total_cost,
              CASE
                WHEN COUNT(DISTINCT product_batch_no) = 0 THEN 0
                ELSE COALESCE(SUM(total_value),0) / COUNT(DISTINCT product_batch_no)
              END::numeric AS avg_cost_per_batch
            FROM stock_transactions
            WHERE {where_sql};
            """,
            params,
        )
        return jsonable_encoder(payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Product summary failed: {type(e).__name__}: {e}")


@router.get("/products/{product_code}/batches")
def product_batches(
    product_code: str,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    try:
        start_utc, end_utc = london_day_bounds_utc(date_from, date_to)

        # Legacy behaviour (no date range): keep using the existing view
        if start_utc is None and end_utc is None:
            payload = rows(
                db,
                """
                SELECT
                  es_product_code,
                  product_batch_no,
                  batch_total_cost,
                  issue_txn_count,
                  first_issue_at,
                  last_issue_at
                FROM analytics_product_batches_cost
                WHERE es_product_code = :product_code
                ORDER BY last_issue_at DESC
                LIMIT :limit OFFSET :offset;
                """,
                {"product_code": product_code, "limit": limit, "offset": offset},
            )
            return jsonable_encoder(payload)

        params: Dict[str, Any] = {
            "product_code": product_code,
            "limit": limit,
            "offset": offset,
            "start_utc": start_utc,
            "end_utc": end_utc,
        }

        where_parts = [
            "st.txn_type='ISSUE'",
            "st.es_product_code = :product_code",
            "st.product_batch_no IS NOT NULL",
        ]
        if start_utc is not None:
            where_parts.append("st.created_at >= :start_utc")
        if end_utc is not None:
            where_parts.append("st.created_at <= :end_utc")
        where_sql = " AND ".join(where_parts)

        payload = rows(
            db,
            f"""
            SELECT
              st.es_product_code,
              st.product_batch_no,
              COALESCE(SUM(st.total_value),0)::numeric AS batch_total_cost,
              COUNT(*)::int AS issue_txn_count,
              MIN(st.created_at) AS first_issue_at,
              MAX(st.created_at) AS last_issue_at
            FROM stock_transactions st
            WHERE {where_sql}
            GROUP BY st.es_product_code, st.product_batch_no
            ORDER BY last_issue_at DESC
            LIMIT :limit OFFSET :offset;
            """,
            params,
        )
        return jsonable_encoder(payload)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Product batches failed: {type(e).__name__}: {e}")


@router.get("/batches/{batch_no}")
def batch_analytics(
    batch_no: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    """
    IMPORTANT: Batch analytics remains unfiltered by global date range (per requirements).
    Restored to the known-good implementation from your previous analytics.py:
      - header from analytics_product_batches_cost
      - materials from analytics_batch_materials
    """
    try:
        header = one(
            db,
            """
            SELECT
              es_product_code,
              product_batch_no,
              batch_total_cost,
              issue_txn_count,
              first_issue_at,
              last_issue_at
            FROM analytics_product_batches_cost
            WHERE product_batch_no = :batch_no
            ORDER BY last_issue_at DESC
            LIMIT 1;
            """,
            {"batch_no": batch_no},
        )
        if not header:
            raise HTTPException(status_code=404, detail="Batch not found")

        materials = rows(
            db,
            """
            SELECT
              stock_txn_id,
              created_at,
              created_by,
              material_code,
              material_name,
              lot_number,
              qty,
              uom_code,
              unit_price,
              total_value
            FROM analytics_batch_materials
            WHERE product_batch_no = :batch_no
            ORDER BY created_at ASC, stock_txn_id ASC;
            """,
            {"batch_no": batch_no},
        )

        return jsonable_encoder({"header": header, "materials": materials})

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch analytics failed: {type(e).__name__}: {e}")


@router.get("/materials/{material_code}/monthly")
def material_monthly(
    material_code: str,
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    try:
        start_utc, end_utc = london_day_bounds_utc(date_from, date_to)

        # Legacy behaviour (no date range): use the existing view
        if start_utc is None and end_utc is None:
            payload = rows(
                db,
                """
                SELECT
                  material_code,
                  material_name,
                  month_bucket,
                  issue_qty_sum,
                  issue_value_sum,
                  receipt_qty_sum,
                  receipt_value_sum,
                  issue_txn_count,
                  receipt_txn_count
                FROM analytics_material_monthly
                WHERE material_code = :material_code
                ORDER BY month_bucket ASC;
                """,
                {"material_code": material_code},
            )
            return jsonable_encoder(payload)

        params: Dict[str, Any] = {"material_code": material_code, "start_utc": start_utc, "end_utc": end_utc}

        payload = rows(
            db,
            """
            SELECT
              m.material_code,
              m.name AS material_name,
              date_trunc('month', (st.created_at AT TIME ZONE 'Europe/London'))::date AS month_bucket,

              COALESCE(SUM(CASE WHEN st.txn_type='ISSUE' THEN st.qty ELSE 0 END),0)::numeric AS issue_qty_sum,
              COALESCE(SUM(CASE WHEN st.txn_type='ISSUE' THEN st.total_value ELSE 0 END),0)::numeric AS issue_value_sum,

              COALESCE(SUM(CASE WHEN st.txn_type='RECEIPT' THEN st.qty ELSE 0 END),0)::numeric AS receipt_qty_sum,
              COALESCE(SUM(CASE WHEN st.txn_type='RECEIPT' THEN st.total_value ELSE 0 END),0)::numeric AS receipt_value_sum,

              COUNT(*) FILTER (WHERE st.txn_type='ISSUE')::int AS issue_txn_count,
              COUNT(*) FILTER (WHERE st.txn_type='RECEIPT')::int AS receipt_txn_count
            FROM stock_transactions st
            JOIN material_lots ml ON ml.id = st.material_lot_id
            JOIN materials m ON m.id = ml.material_id
            WHERE m.material_code = :material_code
              AND (:start_utc IS NULL OR st.created_at >= :start_utc)
              AND (:end_utc IS NULL OR st.created_at <= :end_utc)
            GROUP BY m.material_code, m.name, month_bucket
            ORDER BY month_bucket ASC;
            """,
            params,
        )
        return jsonable_encoder(payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Material monthly failed: {type(e).__name__}: {e}")


@router.get("/materials/{material_code}/summary")
def material_summary(
    material_code: str,
    window_months: int = Query(6, ge=1, le=60),
    safety_factor: float = Query(1.25, ge=0.5, le=5.0),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    """
    Material summary used by the analytics UI.

    Behaviour:
      - If date_from/date_to provided: compute totals within that range (global filter behaviour).
      - Else: keep the legacy window_months behaviour.
    """
    try:
        start_utc, end_utc = london_day_bounds_utc(date_from, date_to)
        range_mode = bool(start_utc or end_utc)

        if range_mode:
            params: Dict[str, Any] = {
                "material_code": material_code,
                "start_utc": start_utc,
                "end_utc": end_utc,
                "safety_factor": safety_factor,
            }

            payload = one(
                db,
                """
                WITH w AS (
                  SELECT
                    COALESCE(:start_utc, (now() AT TIME ZONE 'UTC')::timestamptz) AS window_start_utc,
                    COALESCE(:end_utc,   (now() AT TIME ZONE 'UTC')::timestamptz) AS window_end_utc
                ),
                totals AS (
                  SELECT
                    m.material_code,
                    COALESCE(SUM(CASE WHEN st.txn_type='ISSUE' THEN st.qty ELSE 0 END),0)::numeric AS issue_qty_total,
                    COALESCE(SUM(CASE WHEN st.txn_type='ISSUE' THEN st.total_value ELSE 0 END),0)::numeric AS issue_value_total,
                    COALESCE(SUM(CASE WHEN st.txn_type='RECEIPT' THEN st.qty ELSE 0 END),0)::numeric AS receipt_qty_total,
                    COALESCE(SUM(CASE WHEN st.txn_type='RECEIPT' THEN st.total_value ELSE 0 END),0)::numeric AS receipt_value_total
                  FROM stock_transactions st
                  JOIN material_lots ml ON ml.id = st.material_lot_id
                  JOIN materials m ON m.id = ml.material_id
                  CROSS JOIN w
                  WHERE m.material_code = :material_code
                    AND st.created_at >= w.window_start_utc
                    AND st.created_at <= w.window_end_utc
                  GROUP BY m.material_code
                ),
                days AS (
                  SELECT
                    GREATEST(
                      1,
                      (EXTRACT(EPOCH FROM (w.window_end_utc - w.window_start_utc)) / 86400.0)
                    ) AS window_days
                  FROM w
                )
                SELECT
                  m.material_code AS material_code,
                  m.name AS material_name,
                  m.base_uom_code AS uom_code,
                  NULL::int AS window_months,

                  COALESCE(t.issue_qty_total,0)::numeric AS issue_qty_total,
                  COALESCE(t.issue_value_total,0)::numeric AS issue_value_total,
                  COALESCE(t.receipt_qty_total,0)::numeric AS receipt_qty_total,
                  COALESCE(t.receipt_value_total,0)::numeric AS receipt_value_total,

                  (COALESCE(t.issue_qty_total,0) / d.window_days)::numeric AS avg_daily_usage,

                  NULL::int AS lead_time_days,
                  (:safety_factor)::numeric AS safety_factor,

                  COALESCE(m.low_stock_threshold_qty,0)::numeric AS suggested_low_stock_threshold,

                  ARRAY[
                    'Totals are filtered by date_from/date_to (Europe/London day bounds).',
                    'Material code is resolved via lot -> material joins (stock_transactions has material_lot_id).',
                    'No historical cost recalculation: totals come directly from stock_transactions.'
                  ]::text[] AS calc_notes
                FROM materials m
                LEFT JOIN totals t ON t.material_code = m.material_code
                CROSS JOIN days d
                WHERE m.material_code = :material_code;
                """,
                params,
            )

            if not payload:
                raise HTTPException(status_code=404, detail="Material not found")

            return jsonable_encoder(payload)

        # ---- Legacy window mode (no global date filter) ----
        payload = one(
            db,
            """
            WITH w AS (
              SELECT
                (now() AT TIME ZONE 'UTC')::timestamptz
                  - (((:window_months)::text || ' months')::interval) AS window_start_utc,
                (now() AT TIME ZONE 'UTC')::timestamptz AS window_end_utc
            ),
            totals AS (
              SELECT
                m.material_code,
                COALESCE(SUM(CASE WHEN st.txn_type='ISSUE' THEN st.qty ELSE 0 END),0)::numeric AS issue_qty_total,
                COALESCE(SUM(CASE WHEN st.txn_type='ISSUE' THEN st.total_value ELSE 0 END),0)::numeric AS issue_value_total,
                COALESCE(SUM(CASE WHEN st.txn_type='RECEIPT' THEN st.qty ELSE 0 END),0)::numeric AS receipt_qty_total,
                COALESCE(SUM(CASE WHEN st.txn_type='RECEIPT' THEN st.total_value ELSE 0 END),0)::numeric AS receipt_value_total
              FROM stock_transactions st
              JOIN material_lots ml ON ml.id = st.material_lot_id
              JOIN materials m ON m.id = ml.material_id
              CROSS JOIN w
              WHERE m.material_code = :material_code
                AND st.created_at >= w.window_start_utc
                AND st.created_at <= w.window_end_utc
              GROUP BY m.material_code
            ),
            days AS (
              SELECT
                GREATEST(
                  1,
                  (EXTRACT(EPOCH FROM (w.window_end_utc - w.window_start_utc)) / 86400.0)
                ) AS window_days
              FROM w
            )
            SELECT
              m.material_code AS material_code,
              m.name AS material_name,
              m.base_uom_code AS uom_code,
              (:window_months)::int AS window_months,

              COALESCE(t.issue_qty_total,0)::numeric AS issue_qty_total,
              COALESCE(t.issue_value_total,0)::numeric AS issue_value_total,
              COALESCE(t.receipt_qty_total,0)::numeric AS receipt_qty_total,
              COALESCE(t.receipt_value_total,0)::numeric AS receipt_value_total,

              (COALESCE(t.issue_qty_total,0) / d.window_days)::numeric AS avg_daily_usage,

              NULL::int AS lead_time_days,
              (:safety_factor)::numeric AS safety_factor,

              COALESCE(m.low_stock_threshold_qty,0)::numeric AS suggested_low_stock_threshold,

              ARRAY[
                'Window totals are derived from stock_transactions (authoritative).',
                'Material code is resolved via lot -> material joins (stock_transactions has material_lot_id).',
                'suggested_low_stock_threshold uses the configured materials.low_stock_threshold_qty when set.',
                'lead_time_days is not currently modelled and is returned as NULL.'
              ]::text[] AS calc_notes
            FROM materials m
            LEFT JOIN totals t ON t.material_code = m.material_code
            CROSS JOIN days d
            WHERE m.material_code = :material_code;
            """,
            {"material_code": material_code, "window_months": window_months, "safety_factor": safety_factor},
        )

        if not payload:
            raise HTTPException(status_code=404, detail="Material not found")

        return jsonable_encoder(payload)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Material summary failed: {type(e).__name__}: {e}")


@router.get("/materials/{material_code}/lots")
def material_lots(
    material_code: str,
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    lot_number: Optional[str] = Query(None, description="Optional lot filter (exact or partial)"),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    """
    Lots in scope for a material within the selected date range:
      - Lots that had any stock_transactions rows in range (receipt or issue) for this material.
      - Material resolved via material_lots -> materials (stock_transactions has no material_code).
      - Current status/qty/expiry pulled from lot_balances_view (authoritative current-state view).
    """
    try:
        start_utc, end_utc = london_day_bounds_utc(date_from, date_to)

        params: Dict[str, Any] = {"material_code": material_code, "start_utc": start_utc, "end_utc": end_utc}
        where_parts = ["m.material_code = :material_code"]
        if start_utc is not None:
            where_parts.append("st.created_at >= :start_utc")
        if end_utc is not None:
            where_parts.append("st.created_at <= :end_utc")
        where_sql = " AND ".join(where_parts)

        lot_filter_sql = ""
        if lot_number and lot_number.strip():
            params["lot_number_like"] = f"%{lot_number.strip()}%"
            lot_filter_sql = " AND ml.lot_number ILIKE :lot_number_like "

        payload = rows(
            db,
            f"""
            WITH txn_lots AS (
              SELECT
                ml.id AS material_lot_id,
                ml.lot_number,
                MIN(st.created_at) AS first_txn_at,
                MAX(st.created_at) AS last_txn_at
              FROM stock_transactions st
              JOIN material_lots ml ON ml.id = st.material_lot_id
              JOIN materials m ON m.id = ml.material_id
              WHERE {where_sql}
              {lot_filter_sql}
              GROUP BY ml.id, ml.lot_number
            )
            SELECT
              t.material_lot_id,
              t.lot_number,
              COALESCE(v.status, 'UNKNOWN') AS status,
              COALESCE(v.balance_qty, 0)::numeric AS current_qty,
              v.expiry_date,
              t.first_txn_at,
              t.last_txn_at
            FROM txn_lots t
            LEFT JOIN lot_balances_view v ON v.material_lot_id = t.material_lot_id
            ORDER BY t.last_txn_at DESC, t.lot_number ASC;
            """,
            params,
        )
        return jsonable_encoder(payload)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Material lots failed: {type(e).__name__}: {e}")


@router.get("/materials/{material_code}/traceability")
def material_traceability(
    material_code: str,
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    lot_number: Optional[str] = Query(None, description="Optional lot filter (exact or partial)"),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    """
    Traceability: material (and optionally a specific lot) -> ES batches it was issued into, within date range.
    Uses stock_transactions (authoritative), ISSUE rows only.
    Material resolved via material_lots -> materials (stock_transactions has no material_code).
    """
    try:
        start_utc, end_utc = london_day_bounds_utc(date_from, date_to)

        params: Dict[str, Any] = {"material_code": material_code, "start_utc": start_utc, "end_utc": end_utc}

        where_parts = [
            "st.txn_type='ISSUE'",
            "m.material_code = :material_code",
            "st.product_batch_no IS NOT NULL",
            "st.es_product_code IS NOT NULL",
        ]
        if start_utc is not None:
            where_parts.append("st.created_at >= :start_utc")
        if end_utc is not None:
            where_parts.append("st.created_at <= :end_utc")
        where_sql = " AND ".join(where_parts)

        lot_filter_sql = ""
        if lot_number and lot_number.strip():
            params["lot_number_like"] = f"%{lot_number.strip()}%"
            lot_filter_sql = " AND ml.lot_number ILIKE :lot_number_like "

        payload = rows(
            db,
            f"""
            SELECT
              st.product_batch_no,
              st.es_product_code,
              ml.lot_number,
              COALESCE(SUM(st.qty),0)::numeric AS issue_qty_sum,
              COALESCE(SUM(st.total_value),0)::numeric AS issue_value_sum,
              MAX(st.created_at) AS last_issue_at
            FROM stock_transactions st
            JOIN material_lots ml ON ml.id = st.material_lot_id
            JOIN materials m ON m.id = ml.material_id
            WHERE {where_sql}
            {lot_filter_sql}
            GROUP BY st.product_batch_no, st.es_product_code, ml.lot_number
            ORDER BY last_issue_at DESC, st.product_batch_no ASC, ml.lot_number ASC;
            """,
            params,
        )
        return jsonable_encoder(payload)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Material traceability failed: {type(e).__name__}: {e}")


@router.get("/search")
def analytics_search(
    search_type: str = Query(..., pattern="^(material_code|material_name|lot_number|product_code|batch_no)$"),
    q: str = Query(..., min_length=1, max_length=80),
    limit: int = Query(15, ge=1, le=50),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    qq = q.strip()
    try:
        if search_type == "material_code":
            payload = rows(
                db,
                """
                SELECT
                  'material'::text AS entity_type,
                  m.material_code AS key,
                  m.material_code AS label,
                  m.name AS sublabel
                FROM materials m
                WHERE m.material_code ILIKE :p
                ORDER BY m.material_code
                LIMIT :limit;
                """,
                {"p": f"%{qq}%", "limit": limit},
            )
            return jsonable_encoder(payload)

        if search_type == "material_name":
            payload = rows(
                db,
                """
                SELECT
                  'material'::text AS entity_type,
                  m.material_code AS key,
                  m.material_code AS label,
                  m.name AS sublabel
                FROM materials m
                WHERE m.name ILIKE :p
                ORDER BY m.name
                LIMIT :limit;
                """,
                {"p": f"%{qq}%", "limit": limit},
            )
            return jsonable_encoder(payload)

        if search_type == "lot_number":
            payload = rows(
                db,
                """
                SELECT
                  'lot'::text AS entity_type,
                  ml.lot_number AS key,
                  ml.lot_number AS label,
                  (m.material_code || ' — ' || m.name) AS sublabel,
                  m.material_code AS material_code,
                  m.name AS material_name
                FROM material_lots ml
                JOIN materials m ON m.id = ml.material_id
                WHERE ml.lot_number ILIKE :p
                ORDER BY ml.lot_number
                LIMIT :limit;
                """,
                {"p": f"%{qq}%", "limit": limit},
            )
            return jsonable_encoder(payload)

        if search_type == "product_code":
            payload = rows(
                db,
                """
                SELECT
                  'product'::text AS entity_type,
                  a.es_product_code AS key,
                  a.es_product_code AS label,
                  ('Unique batches: ' || a.unique_batch_count::text) AS sublabel
                FROM analytics_product_batch_frequency a
                WHERE a.es_product_code ILIKE :p
                ORDER BY a.unique_batch_count DESC, a.es_product_code
                LIMIT :limit;
                """,
                {"p": f"%{qq}%", "limit": limit},
            )
            return jsonable_encoder(payload)

        # batch_no
        payload = rows(
            db,
            """
            SELECT
              'batch'::text AS entity_type,
              a.product_batch_no AS key,
              a.product_batch_no AS label,
              (a.es_product_code || ' — total cost ' || a.batch_total_cost::text) AS sublabel
            FROM analytics_product_batches_cost a
            WHERE a.product_batch_no ILIKE :p
            ORDER BY a.last_issue_at DESC
            LIMIT :limit;
            """,
            {"p": f"%{qq}%", "limit": limit},
        )
        return jsonable_encoder(payload)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {type(e).__name__}: {e}")


@router.get("/latest-batches")
def latest_batches(
    limit: int = Query(8, ge=1, le=50),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    """
    Latest unique batches (based on ISSUE transactions).
    Returns newest first. Each row represents one unique product_batch_no.
    """
    data = rows(
        db,
        """
        SELECT
          st.product_batch_no,
          st.es_product_code,
          MAX(st.created_at) AS last_issue_at,
          MAX(COALESCE(st.product_manufacture_date::timestamp, st.created_at)) AS manufactured_at
        FROM stock_transactions st
        WHERE st.txn_type = 'ISSUE'
          AND st.product_batch_no IS NOT NULL
          AND st.es_product_code IS NOT NULL
        GROUP BY st.product_batch_no, st.es_product_code
        ORDER BY manufactured_at DESC
        LIMIT :limit;
        """,
        {"limit": limit},
    )

    return jsonable_encoder(
        {
            "meta": {
                "data_cut": datetime.utcnow().isoformat(),
                "logic": "latest unique batches from ISSUE txns",
            },
            "rows": data,
        }
    )
