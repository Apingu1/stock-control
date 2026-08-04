from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..security import require_any_permission
from . import analytics as legacy_analytics


router = APIRouter(prefix="/analytics", tags=["analytics"])


def _customer_for_batch(db: Session, batch_no: str) -> str | None:
    row = db.execute(
        text(
            """
            SELECT customer_name
            FROM consumption_batches
            WHERE product_batch_no = :batch_no
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """
        ),
        {"batch_no": batch_no},
    ).mappings().first()
    if row:
        return row["customer_name"]

    legacy = db.execute(
        text(
            """
            SELECT MAX(customer_name) AS customer_name
            FROM stock_transactions
            WHERE product_batch_no = :batch_no
              AND txn_type = 'ISSUE'
            """
        ),
        {"batch_no": batch_no},
    ).mappings().first()
    return legacy["customer_name"] if legacy else None


@router.get("/products/{product_code}/batches")
def product_batches_with_customer(
    product_code: str,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD (Europe/London)"),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    payload: list[dict[str, Any]] = legacy_analytics.product_batches(
        product_code=product_code,
        limit=limit,
        offset=offset,
        date_from=date_from,
        date_to=date_to,
        db=db,
        _=user,
    )
    for row in payload:
        batch_no = row.get("product_batch_no")
        row["customer_name"] = _customer_for_batch(db, str(batch_no)) if batch_no else None
    return jsonable_encoder(payload)


@router.get("/batches/{batch_no}")
def batch_analytics_with_customer(
    batch_no: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("analytics.view", "admin.full")),
):
    payload: dict[str, Any] = legacy_analytics.batch_analytics(
        batch_no=batch_no,
        db=db,
        _=user,
    )
    payload.setdefault("header", {})["customer_name"] = _customer_for_batch(db, batch_no)
    return jsonable_encoder(payload)
