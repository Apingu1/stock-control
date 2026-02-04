# app/routers/summary.py

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db

router = APIRouter(prefix="/summary", tags=["summary"])


class StockSummary(BaseModel):
    total_materials: int
    total_lots: int
    lots_expiring_30d: int
    quarantine_lots: int
    book_value_on_hand: float


@router.get("/stock", response_model=StockSummary)
def get_stock_summary(db: Session = Depends(get_db)) -> StockSummary:
    total_materials = db.execute(
        text("SELECT COUNT(*) FROM materials WHERE status = 'ACTIVE'")
    ).scalar_one()

    total_lots = db.execute(text("SELECT COUNT(*) FROM material_lots")).scalar_one()

    lots_expiring_30d = db.execute(
        text(
            """
            SELECT COUNT(*)
            FROM lot_balances_view
            WHERE expiry_date IS NOT NULL
              AND expiry_date >= CURRENT_DATE
              AND expiry_date < CURRENT_DATE + INTERVAL '30 days'
              AND balance_qty > 0
            """
        )
    ).scalar_one()

    quarantine_lots = db.execute(
        text(
            """
            SELECT COUNT(*)
            FROM material_lots
            WHERE status = 'QUARANTINE'
            """
        )
    ).scalar_one()

    book_value_on_hand = db.execute(
        text(
            """
            SELECT COALESCE(
                SUM(COALESCE(total_value, 0) * direction),
                0
            )
            FROM stock_transactions
            """
        )
    ).scalar_one()

    return StockSummary(
        total_materials=int(total_materials or 0),
        total_lots=int(total_lots or 0),
        lots_expiring_30d=int(lots_expiring_30d or 0),
        quarantine_lots=int(quarantine_lots or 0),
        book_value_on_hand=float(book_value_on_hand or 0.0),
    )


# ----------------------------
# ✅ Dashboard summary (FIXED)
# ----------------------------

class DashboardSummary(BaseModel):
    total_materials: int
    materials_low_expiry: int
    materials_low_stock: int
    batches_manufactured_today: int
    receipts_today: int
    total_material_value: float


@router.get("/dashboard", response_model=DashboardSummary)
def get_dashboard_summary(db: Session = Depends(get_db)) -> DashboardSummary:
    total_materials = db.execute(
        text("SELECT COUNT(*) FROM materials WHERE status = 'ACTIVE'")
    ).scalar_one()

    # Materials in LOW STOCK (unique material_code)
    materials_low_stock = db.execute(
        text(
            """
            WITH avail_by_material AS (
              SELECT
                lb.material_code,
                COALESCE(SUM(CASE WHEN UPPER(lb.status) = 'AVAILABLE' THEN lb.balance_qty ELSE 0 END), 0) AS available_qty
              FROM lot_balances_view lb
              GROUP BY lb.material_code
            )
            SELECT COUNT(*)
            FROM materials m
            JOIN avail_by_material a ON a.material_code = m.material_code
            WHERE m.status = 'ACTIVE'
              AND m.low_stock_threshold_qty IS NOT NULL
              AND a.available_qty <= m.low_stock_threshold_qty
            """
        )
    ).scalar_one()

    # ✅ FIXED: Materials in LOW EXPIRY (unique material_code)
    # We compare dates using: expiry_date <= CURRENT_DATE + (days * interval)
    materials_low_expiry = db.execute(
        text(
            """
            SELECT COUNT(DISTINCT lb.material_code)
            FROM lot_balances_view lb
            JOIN materials m ON m.material_code = lb.material_code
            WHERE m.status = 'ACTIVE'
              AND m.expiry_alert_days IS NOT NULL
              AND UPPER(lb.status) = 'AVAILABLE'
              AND lb.balance_qty > 0
              AND lb.expiry_date IS NOT NULL
              AND lb.expiry_date >= CURRENT_DATE
              AND lb.expiry_date <= (CURRENT_DATE + (m.expiry_alert_days * INTERVAL '1 day'))
            """
        )
    ).scalar_one()

    # Batches manufactured today (distinct product_batch_no)
    batches_manufactured_today = db.execute(
        text(
            """
            SELECT COUNT(DISTINCT st.product_batch_no)
            FROM stock_transactions st
            WHERE st.direction = -1
              AND st.txn_type = 'ISSUE'
              AND st.product_batch_no IS NOT NULL
              AND COALESCE(st.product_manufacture_date, (st.created_at::date)) = CURRENT_DATE
            """
        )
    ).scalar_one()

    # Receipts today
    receipts_today = db.execute(
        text(
            """
            SELECT COUNT(*)
            FROM stock_transactions st
            WHERE st.direction = 1
              AND st.txn_type = 'RECEIPT'
              AND (st.created_at::date) = CURRENT_DATE
            """
        )
    ).scalar_one()

    # Total material value (sum of lot_value for lots with balance > 0)
    total_material_value = db.execute(
        text(
            """
            SELECT COALESCE(SUM(COALESCE(lot_value, 0)), 0)
            FROM lot_balances_view
            WHERE balance_qty > 0
            """
        )
    ).scalar_one()

    return DashboardSummary(
        total_materials=int(total_materials or 0),
        materials_low_expiry=int(materials_low_expiry or 0),
        materials_low_stock=int(materials_low_stock or 0),
        batches_manufactured_today=int(batches_manufactured_today or 0),
        receipts_today=int(receipts_today or 0),
        total_material_value=float(total_material_value or 0.0),
    )
