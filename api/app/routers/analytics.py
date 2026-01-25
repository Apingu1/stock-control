from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..security import require_permission
from ..models import User  # matches your other routers


router = APIRouter(prefix="/analytics", tags=["analytics"])


# --- RBAC helper: allow analytics.view OR admin.full ---
def require_any_permission(*permission_keys: str):
    """
    FastAPI dependency factory that allows access if the user has ANY of the provided permissions.
    Uses the existing require_permission() from this codebase.
    Returns User to match existing router patterns.
    """

    def _dep(user: User = Depends(require_permission(permission_keys[0]))):  # placeholder, overwritten below
        return user

    # We can't dynamically set Depends like that cleanly, so we implement the check directly
    # using user_has_permission logic already inside require_permission() by trying each key.
    def _check(user: User = Depends(require_permission(permission_keys[0]))):
        return user

    # Instead, implement our own dependency using the same JWT parsing
    # by requiring admin.full first? No.
    # We will do "try each require_permission(key)" by nesting.
    # FastAPI only resolves one Depends, so we do a manual permission check in security.py style.
    # Easiest: call require_permission for the FIRST key, and if it fails, try admin.full.
    # But failures raise HTTPException before we can catch.
    #
    # So: build a dependency that uses "get_current_user" from security.py instead.
    #
    # In this codebase, require_permission wraps get_current_user() and then checks perms.
    # We'll import get_current_user and use user_has_permission to check multiple keys.

    raise RuntimeError("require_any_permission placeholder")  # replaced below


# --- Import underlying helpers from your existing security layer ---
from ..security import get_current_user, user_has_permission  # noqa: E402

def require_any_permission(*permission_keys: str):
    def _dep(
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> User:
        for key in permission_keys:
            # user_has_permission requires db in this project
            if user_has_permission(db=db, user=user, permission_key=key):
                return user

        raise HTTPException(
            status_code=403,
            detail=f"Missing permission (any of): {', '.join(permission_keys)}",
        )

    return _dep



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
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    """
    Landing dashboard:
    - Monthly KPIs (calendar month, Europe/London bucket)
    - Most commonly manufactured products (count distinct ES batch numbers per product code)
    """
    try:
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
            """,
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
        # jsonable_encoder handles Decimal/date/datetime safely
        return jsonable_encoder(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics dashboard failed: {type(e).__name__}: {e}")


@router.get("/products/{product_code}/summary")
def product_summary(
    product_code: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    try:
        payload = one(
            db,
            """
            SELECT
              :product_code AS es_product_code,
              COUNT(DISTINCT product_batch_no)::int AS unique_batches,
              COALESCE(SUM(total_value),0)::numeric AS total_cost,
              CASE
                WHEN COUNT(DISTINCT product_batch_no) = 0 THEN 0
                ELSE COALESCE(SUM(total_value),0) / COUNT(DISTINCT product_batch_no)
              END::numeric AS avg_cost_per_batch
            FROM stock_transactions
            WHERE txn_type='ISSUE'
              AND es_product_code = :product_code
              AND product_batch_no IS NOT NULL;
            """,
            {"product_code": product_code},
        )
        return jsonable_encoder(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Product summary failed: {type(e).__name__}: {e}")


@router.get("/products/{product_code}/batches")
def product_batches(
    product_code: str,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    try:
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Product batches failed: {type(e).__name__}: {e}")


@router.get("/batches/{batch_no}")
def batch_analytics(
    batch_no: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
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
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    try:
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Material monthly failed: {type(e).__name__}: {e}")


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
                  (m.material_code || ' — ' || m.name) AS sublabel
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

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {type(e).__name__}: {e}")
