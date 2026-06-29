# api/app/routers/issues.py
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from typing import List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    Material,
    MaterialLot,
    StockTransaction,
    User,
    StockTransactionEdit,
    QuarantineEvent,  # ✅ Phase Q1: ledger rows for DESTRUCTION
    QuarantinePolicySetting,
)
from ..schemas import IssueCreate, IssueOut, IssueUpdate
from ..security import require_permission

router = APIRouter(prefix="/issues", tags=["issues"])


# ---------------------------------------------------------------------------
# Decimal helpers (preserve existing behaviour)
# - unit_price rounding: 4dp (matches prior _round_unit)
# - money rounding: 2dp (matches prior _round_money)
# - qty rounding: 6dp (matches DB NUMERIC(18,6) and common inventory precision)
# ---------------------------------------------------------------------------

QTY_Q = Decimal("0.000001")   # 6dp
UNIT_Q = Decimal("0.0001")    # 4dp (keep existing UI logic)
MONEY_Q = Decimal("0.01")     # 2dp


def _to_decimal(value: Any) -> Optional[Decimal]:
    """
    Convert value (float/int/str/Decimal/None) to Decimal safely.
    IMPORTANT: For floats, use Decimal(str(value)) to avoid IEEE-754 artifacts.
    """
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _q_qty(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return value.quantize(QTY_Q, rounding=ROUND_HALF_UP)


def _q_unit(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return value.quantize(UNIT_Q, rounding=ROUND_HALF_UP)


def _q_money(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return value.quantize(MONEY_Q, rounding=ROUND_HALF_UP)


def _is_quarantine_status(status: str | None) -> bool:
    return (status or "").strip().upper() == "QUARANTINE"


def _allow_issue_from_quarantine(db: Session) -> bool:
    """
    Read the singleton quarantine policy.

    Existing installations seed id=1 in db/init/121_quarantine_events_and_policy.sql.
    If the row is missing for any legacy/dev dataset, preserve historical behaviour
    by treating the policy as warn-only until an admin explicitly saves it.
    """
    row = db.query(QuarantinePolicySetting).filter(QuarantinePolicySetting.id == 1).one_or_none()
    if row is None:
        return True
    return bool(row.allow_issue_from_quarantine)


def _enforce_quarantine_issue_policy(
    db: Session,
    lot: MaterialLot,
    material: Material,
    *,
    status_at_txn: str | None = None,
) -> None:
    """
    Server-side control for the Quarantine policy toggle.

    UI warnings are advisory only; this backend check is the authoritative GMP
    control that prevents ISSUE/consumption posting from QUARANTINE stock when
    the admin policy is set to Blocked.
    """
    current_status_is_quarantine = _is_quarantine_status(lot.status)
    txn_status_is_quarantine = _is_quarantine_status(status_at_txn)

    if not current_status_is_quarantine and not txn_status_is_quarantine:
        return

    if _allow_issue_from_quarantine(db):
        return

    blocked_status = "QUARANTINE" if current_status_is_quarantine else "QUARANTINE at transaction time"
    raise HTTPException(
        status_code=400,
        detail=(
            "Issuing from QUARANTINE lots is blocked by quarantine policy. "
            f"Material {material.material_code}, lot {lot.lot_number} is {blocked_status}."
        ),
    )


def _lot_weighted_unit_price(db: Session, lot_id: int) -> Decimal | None:
    """
    D2 (Option A): Use the lot's actual cost basis.
    Weighted average of RECEIPT transactions for this lot:
      unit = SUM(receipt_total_value) / SUM(receipt_qty)

    If some old receipts have total_value NULL but unit_price present, we treat
    total_value as (unit_price * qty) for the purpose of the weighting.
    """
    sum_value, sum_qty = (
        db.query(
            func.coalesce(
                func.sum(
                    func.coalesce(
                        StockTransaction.total_value,
                        StockTransaction.unit_price * StockTransaction.qty,
                    )
                ),
                0,
            ),
            func.coalesce(func.sum(StockTransaction.qty), 0),
        )
        .filter(
            StockTransaction.material_lot_id == lot_id,
            StockTransaction.txn_type == "RECEIPT",
        )
        .one()
    )

    sum_value_dec = _to_decimal(sum_value) or Decimal("0")
    sum_qty_dec = _to_decimal(sum_qty) or Decimal("0")

    if sum_qty_dec <= 0:
        return None

    return _q_unit(sum_value_dec / sum_qty_dec)


@router.post("/", response_model=IssueOut, status_code=201)
def create_issue(
    payload: IssueCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("issues.create")),
) -> IssueOut:
    created_by = user.username

    material = db.query(Material).filter(Material.material_code == payload.material_code).one_or_none()
    if material is None:
        raise HTTPException(status_code=404, detail="Material not found")

    # qty from payload (supports current float schemas OR future Decimal schemas)
    payload_qty = _to_decimal(getattr(payload, "qty", None))
    if payload_qty is None:
        raise HTTPException(status_code=400, detail="Invalid qty")
    payload_qty = _q_qty(payload_qty)
    if payload_qty is None or payload_qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")

    lot: MaterialLot | None = None

    if payload.material_lot_id is not None:
        lot = (
            db.query(MaterialLot)
            .filter(
                MaterialLot.id == payload.material_lot_id,
                MaterialLot.material_id == material.id,
            )
            .one_or_none()
        )
        if lot is None:
            raise HTTPException(status_code=404, detail="Lot segment not found")
    else:
        matches = (
            db.query(MaterialLot)
            .filter(
                MaterialLot.material_id == material.id,
                MaterialLot.lot_number == payload.lot_number,
            )
            .order_by(MaterialLot.id.asc())
            .all()
        )

        if len(matches) == 0:
            lot = MaterialLot(
                material_id=material.id,
                lot_number=payload.lot_number,
                expiry_date=None,
                status="AVAILABLE",
                created_by=created_by,
            )
            db.add(lot)
            db.flush()
        elif len(matches) == 1:
            lot = matches[0]
        else:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Multiple lot segments exist for this lot number. "
                    "Please select a specific segment (material_lot_id)."
                ),
            )

    # Authoritative quarantine control. The UI warning/checkbox must not be the
    # only protection, because requests can still be posted directly to /issues/.
    _enforce_quarantine_issue_policy(db, lot, material)

    # Current balance as Decimal
    current_balance = (
        db.query(func.coalesce(func.sum(StockTransaction.qty * StockTransaction.direction), 0))
        .filter(StockTransaction.material_lot_id == lot.id)
        .scalar()
    )
    current_balance_dec = _to_decimal(current_balance) or Decimal("0")
    current_balance_dec = _q_qty(current_balance_dec) or Decimal("0")

    if current_balance_dec < payload_qty:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient stock in lot {lot.lot_number} "
                f"(available {current_balance_dec}, requested {payload_qty})"
            ),
        )

    # ✅ D2 costing: derive issue unit cost from lot weighted receipts (Decimal)
    lot_unit_price = _lot_weighted_unit_price(db, lot.id)  # 4dp
    issue_total_value = _q_money(payload_qty * lot_unit_price) if lot_unit_price is not None else None

    now = datetime.utcnow()
    txn = StockTransaction(
        material_lot_id=lot.id,
        txn_type="ISSUE",
        consumption_type=payload.consumption_type or "USAGE",
        qty=payload_qty,  # Decimal
        uom_code=payload.uom_code,
        direction=-1,
        unit_price=lot_unit_price,      # Decimal (4dp)
        total_value=issue_total_value,  # Decimal (2dp)
        target_ref=payload.target_ref,

        # ✅ FIX: persist ES product code into the issue transaction
        es_product_code=(payload.es_product_code.strip() if getattr(payload, "es_product_code", None) else None),

        product_batch_no=payload.product_batch_no,
        product_manufacture_date=payload.product_manufacture_date,
        comment=payload.comment,
        material_status_at_txn=lot.status,  # snapshot at time of usage
        created_at=now,
        created_by=created_by,
    )

    db.add(txn)

    # --- Phase Q1: Quarantine ledger (destruction issues) -----------------
    # We DO NOT change stock logic. This ONLY records a ledger row when the
    # consumption_type is DESTRUCTION so the quarantine log can show it as RECORDED.
    if (payload.consumption_type or "USAGE") == "DESTRUCTION":
        db.add(
            QuarantineEvent(
                event_type="DESTRUCTION",
                material_lot_id=lot.id,
                dest_material_lot_id=None,
                qty=payload_qty,
                uom_code=payload.uom_code,
                from_status=lot.status,
                to_status=None,
                reason=(payload.comment or "DESTRUCTION issue"),
                created_by=created_by,
                source="RECORDED",
            )
        )

    db.commit()
    db.refresh(txn)
    db.refresh(lot)
    db.refresh(material)

    manufacturer = lot.manufacturer or material.manufacturer
    supplier = lot.supplier or material.supplier

    return IssueOut(
        id=txn.id,
        material_code=material.material_code,
        material_name=material.name,
        lot_number=lot.lot_number,
        expiry_date=lot.expiry_date,
        qty=txn.qty,
        uom_code=txn.uom_code,
        unit_price=txn.unit_price,
        total_value=txn.total_value,
        es_product_code=txn.es_product_code,
        product_batch_no=txn.product_batch_no,
        manufacturer=manufacturer,
        supplier=supplier,
        product_manufacture_date=txn.product_manufacture_date,
        consumption_type=txn.consumption_type or "USAGE",
        target_ref=txn.target_ref,
        created_at=txn.created_at,
        created_by=txn.created_by or created_by,
        comment=txn.comment,
        material_status_at_txn=txn.material_status_at_txn,
    )


@router.get("/", response_model=List[IssueOut])
def list_issues(
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("issues.view")),
) -> List[IssueOut]:
    stmt = (
        select(StockTransaction, MaterialLot, Material)
        .join(MaterialLot, StockTransaction.material_lot_id == MaterialLot.id)
        .join(Material, MaterialLot.material_id == Material.id)
        .where(StockTransaction.txn_type == "ISSUE")
        .order_by(StockTransaction.created_at.desc())
        .limit(limit)
    )

    rows = db.execute(stmt).all()
    results: List[IssueOut] = []

    for txn, lot, material in rows:
        manufacturer = lot.manufacturer or material.manufacturer
        supplier = lot.supplier or material.supplier

        results.append(
            IssueOut(
                id=txn.id,
                material_code=material.material_code,
                material_name=material.name,
                lot_number=lot.lot_number,
                expiry_date=lot.expiry_date,
                qty=txn.qty,
                uom_code=txn.uom_code,
                unit_price=txn.unit_price,
                total_value=txn.total_value,
                es_product_code=txn.es_product_code,
                product_batch_no=txn.product_batch_no,
                manufacturer=manufacturer,
                supplier=supplier,
                product_manufacture_date=txn.product_manufacture_date,
                consumption_type=txn.consumption_type or "USAGE",
                target_ref=txn.target_ref,
                created_at=txn.created_at,
                created_by=txn.created_by or "—",
                comment=txn.comment,
                material_status_at_txn=txn.material_status_at_txn,
            )
        )

    return results


@router.put("/{issue_id}", response_model=IssueOut)
def update_issue(
    issue_id: int,
    payload: IssueUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("issues.edit")),
) -> IssueOut:
    reason = (payload.edit_reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="edit_reason is required")

    txn: StockTransaction | None = db.query(StockTransaction).filter(StockTransaction.id == issue_id).one_or_none()
    if txn is None or txn.txn_type != "ISSUE":
        raise HTTPException(status_code=404, detail="Issue not found")

    lot = db.query(MaterialLot).filter(MaterialLot.id == txn.material_lot_id).one()
    material = db.query(Material).filter(Material.id == lot.material_id).one()

    before_json = StockTransactionEdit.snapshot_txn(txn)

    # New qty from payload
    new_qty = _to_decimal(getattr(payload, "qty", None))
    if new_qty is None:
        raise HTTPException(status_code=400, detail="Invalid qty")
    new_qty = _q_qty(new_qty)
    if new_qty is None or new_qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")

    current_balance = (
        db.query(func.coalesce(func.sum(StockTransaction.qty * StockTransaction.direction), 0))
        .filter(StockTransaction.material_lot_id == txn.material_lot_id)
        .scalar()
    )
    current_balance_dec = _to_decimal(current_balance) or Decimal("0")
    current_balance_dec = _q_qty(current_balance_dec) or Decimal("0")

    # remove old issue (adds stock back), then apply new qty
    old_qty = _to_decimal(txn.qty) or Decimal("0")
    old_qty = _q_qty(old_qty) or Decimal("0")

    # If the edit increases the issued quantity, that increase is effectively a
    # further issue from the same lot, so enforce quarantine policy before the
    # stock balance check. Reductions/corrections remain possible for audit fixes.
    if new_qty > old_qty:
        _enforce_quarantine_issue_policy(db, lot, material, status_at_txn=txn.material_status_at_txn)

    balance_without_old = current_balance_dec + old_qty
    if new_qty > balance_without_old:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient stock in lot {lot.lot_number} "
                f"(available {balance_without_old}, requested {new_qty})"
            ),
        )

    txn.qty = new_qty
    txn.consumption_type = payload.consumption_type or "USAGE"
    txn.target_ref = payload.target_ref
    txn.product_batch_no = payload.product_batch_no
    txn.product_manufacture_date = payload.product_manufacture_date
    txn.comment = payload.comment

    # ✅ FIX: allow editing ES product code (still audit-trailed)
    if hasattr(payload, "es_product_code"):
        txn.es_product_code = payload.es_product_code.strip() if payload.es_product_code else None

    # Keep txn.material_status_at_txn unchanged (historical snapshot)

    # ✅ Recompute costing for the edited qty.
    # Prefer: keep the original unit_price on the txn if present (historical),
    # otherwise compute from lot receipts.
    unit_price = _to_decimal(txn.unit_price)
    if unit_price is None:
        unit_price = _lot_weighted_unit_price(db, lot.id)

    unit_price = _q_unit(unit_price) if unit_price is not None else None
    txn.unit_price = unit_price
    txn.total_value = _q_money(txn.qty * unit_price) if unit_price is not None else None

    after_json = StockTransactionEdit.snapshot_txn(txn)

    audit = StockTransactionEdit(
        stock_transaction_id=txn.id,
        edited_by=user.username,
        edit_reason=reason,
        before_json=before_json,
        after_json=after_json,
    )
    db.add(audit)
    db.commit()

    manufacturer = lot.manufacturer or material.manufacturer
    supplier = lot.supplier or material.supplier

    return IssueOut(
        id=txn.id,
        material_code=material.material_code,
        material_name=material.name,
        lot_number=lot.lot_number,
        expiry_date=lot.expiry_date,
        qty=txn.qty,
        uom_code=txn.uom_code,
        unit_price=txn.unit_price,
        total_value=txn.total_value,
        es_product_code=txn.es_product_code,
        product_batch_no=txn.product_batch_no,
        manufacturer=manufacturer,
        supplier=supplier,
        product_manufacture_date=txn.product_manufacture_date,
        consumption_type=txn.consumption_type or "USAGE",
        target_ref=txn.target_ref,
        created_at=txn.created_at,
        created_by=txn.created_by or "—",
        comment=txn.comment,
        material_status_at_txn=txn.material_status_at_txn,
    )