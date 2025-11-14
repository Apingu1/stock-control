from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import LotBalanceOut

router = APIRouter(prefix="/lot-balances", tags=["lot-balances"])


@router.get("/", response_model=List[LotBalanceOut])
def list_lot_balances(
    db: Session = Depends(get_db),
    material_code: Optional[str] = Query(
        None, description="Filter by material_code, e.g. MAT0327"
    ),
    search: Optional[str] = Query(
        None, description="Search by material code, name, or lot number (ILIKE)"
    ),
    include_zero: bool = Query(
        False, description="Include lots with zero balance"
    ),
    limit: int = Query(200, ge=1, le=1000),
):
    sql = """
        SELECT
            m.material_code,
            m.name AS material_name,
            v.lot_number,
            v.expiry_date,
            v.status,
            v.balance_qty,
            v.uom_code
        FROM v_lot_balances v
        JOIN materials m ON m.id = v.material_id
        WHERE 1 = 1
    """
    params: dict = {}

    if not include_zero:
        sql += " AND v.balance_qty <> 0"

    if material_code:
        sql += " AND m.material_code = :material_code"
        params["material_code"] = material_code

    if search:
        sql += """
            AND (
                m.material_code ILIKE :search
                OR m.name ILIKE :search
                OR v.lot_number ILIKE :search
            )
        """
        params["search"] = f"%{search}%"

    sql += " ORDER BY m.material_code, v.lot_number LIMIT :limit"
    params["limit"] = limit

    rows = db.execute(text(sql), params).mappings().all()
    return [LotBalanceOut(**row) for row in rows]
