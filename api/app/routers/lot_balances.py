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
    # Use the lot_balances_view directly – it already joins materials
    sql = """
        SELECT
            v.material_lot_id,
            v.material_code,
            v.material_name,
            v.category_code,
            v.type_code,
            v.lot_number,
            v.expiry_date,
            v.status,
            v.manufacturer,
            v.supplier,
            v.balance_qty,
            v.uom_code
        FROM lot_balances_view v
        WHERE 1 = 1
    """
    params: dict = {}

    if not include_zero:
        sql += " AND v.balance_qty <> 0"

    if material_code:
        sql += " AND v.material_code = :material_code"
        params["material_code"] = material_code

    if search:
        sql += """
            AND (
                v.material_code ILIKE :search
                OR v.material_name ILIKE :search
                OR v.lot_number ILIKE :search
            )
        """
        params["search"] = f"%{search}%"

    sql += " ORDER BY v.material_code, v.lot_number LIMIT :limit"
    params["limit"] = limit

    rows = db.execute(text(sql), params).mappings().all()
    return [
        LotBalanceOut(
            material_lot_id=row["material_lot_id"],
            material_code=row["material_code"],
            material_name=row["material_name"],
            category_code=row["category_code"],
            type_code=row["type_code"],
            lot_number=row["lot_number"],
            expiry_date=row["expiry_date"],
            status=row["status"],
            manufacturer=row["manufacturer"],
            supplier=row["supplier"],
            balance_qty=row["balance_qty"],
            uom_code=row["uom_code"],
        )
        for row in rows
    ]
