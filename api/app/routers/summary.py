# app/routers/summary.py

from datetime import date, timedelta
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
    # 1) Total active materials
    total_materials = db.execute(
        text("SELECT COUNT(*) FROM materials WHERE status = 'ACTIVE'")
    ).scalar_one()

    # 2) Total lots (any status)
    total_lots = db.execute(
        text("SELECT COUNT(*) FROM material_lots")
    ).scalar_one()

    # 3) Lots expiring in the next 30 days with stock on hand
    lots_expiring_30d = db.execute(
        text(
            """
            SELECT COUNT(*)
            FROM v_lot_balances
            WHERE expiry_date IS NOT NULL
              AND expiry_date >= CURRENT_DATE
              AND expiry_date < CURRENT_DATE + INTERVAL '30 days'
              AND balance_qty > 0
            """
        )
    ).scalar_one()

    # 4) Lots in quarantine (any balance)
    quarantine_lots = db.execute(
        text(
            """
            SELECT COUNT(*)
            FROM material_lots
            WHERE status = 'QUARANTINE'
            """
        )
    ).scalar_one()

    # 5) Book value on hand (very simple approximation)
    #    Sum of total_value * direction across all stock_transactions.
    #    If total_value is NULL for some rows, treat as 0.
    book_value_on_hand = db.execute(
        text(
            """
            SELECT COALESCE(
                SUM(
                    COALESCE(total_value, 0) * direction
                ),
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
