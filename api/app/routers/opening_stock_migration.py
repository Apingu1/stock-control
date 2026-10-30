"""Controlled opening-stock import for a Windows VM or Codespaces StkFlo deployment.

Transport is plain CSV text in JSON: no local filesystem paths, Python Excel
dependencies, Windows-specific commands or historical consumption imports.
Preview is read-only; commit validates again under a database advisory lock.
"""
from __future__ import annotations

import csv
import hashlib
import io
from datetime import date, timedelta, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..material_classification import validate_material_classification
from ..models import (
    ExpiryThresholdSetting, Material, MaterialApprovedManufacturer, MaterialLot, StockTransaction, User,
)
from ..security import require_permission

router = APIRouter(prefix="/admin/migration", tags=["admin", "migration"])
MAX_BYTES = 5_000_000
MAX_ROWS = 6000
QTY = Decimal("0.000001")
MONEY = Decimal("0.01")
PRICE = Decimal("0.000001")
HEADERS = [
    "record_type", "material_code", "material_name", "category_code",
    "type_code", "uom_code", "material_status", "material_manufacturer",
    "material_supplier", "lot_number", "lot_status", "expiry_date",
    "lot_manufacturer", "lot_supplier", "include_opening", "confirmed_qty",
    "original_unit_cost_gbp", "current_stock_value_gbp",
    "cost_source_reference", "qa_verification_reference", "qa_verified_by",
]


class PreviewRequest(BaseModel):
    csv_text: str = Field(..., min_length=1)


class CommitRequest(PreviewRequest):
    source_sha256: str = Field(..., min_length=64, max_length=64)
    cutover_date: date
    approval_reference: str = Field(..., min_length=3, max_length=200)
    approved_by: str = Field(..., min_length=3, max_length=150)
    confirm: str


def _read_csv(raw: str):
    if len(raw.encode("utf-8")) > MAX_BYTES:
        raise HTTPException(413, "CSV exceeds 5 MB")
    try:
        reader = csv.DictReader(io.StringIO(raw.lstrip("\ufeff"), newline=""), strict=True)
        if reader.fieldnames is None:
            raise ValueError("Empty CSV")
        if len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError("Duplicate CSV column headings")
        missing = set(HEADERS) - set(reader.fieldnames)
        if missing:
            raise ValueError("Missing columns: " + ", ".join(sorted(missing)))
        records = []
        for n, record in enumerate(reader, start=2):
            if n > MAX_ROWS + 1:
                raise ValueError("More than 6,000 rows")
            if None in record:
                raise ValueError(f"Row {n} contains extra columns; check embedded commas")
            records.append((n, {k: (v or "").strip() for k, v in record.items()}))
        return records
    except (csv.Error, ValueError, UnicodeError) as exc:
        raise HTTPException(400, f"Invalid migration CSV: {exc}") from exc


def _decimal(v: str, label: str, row: int, issues: list, *, positive=False) -> Optional[Decimal]:
    try:
        d = Decimal(v)
        if not d.is_finite() or (positive and d <= 0) or (not positive and d < 0):
            raise InvalidOperation()
        return d
    except (InvalidOperation, ValueError):
        issues.append({"row": row, "message": f"{label} must be a valid {'positive' if positive else 'non-negative'} decimal"})
        return None


def _evaluate(raw: str, db: Session):
    records = _read_csv(raw)
    issues: list[dict] = []
    warnings: list[dict] = []
    materials: dict[str, dict] = {}
    lots: list[dict] = []
    names = set()

    for n, r in records:
        kind = r["record_type"].upper()
        code = r["material_code"].strip()
        if kind not in {"MATERIAL", "LOT"}:
            issues.append({"row": n, "message": "record_type must be MATERIAL or LOT"})
            continue
        if not code or len(code) > 50 or code.upper() == "CANCELLED BMR":
            issues.append({"row": n, "message": "Missing, invalid or reserved material code"})
            continue
        names.add(code)
        if kind == "MATERIAL":
            if code in materials:
                issues.append({"row": n, "message": f"Duplicate MATERIAL definition: {code}"})
                continue
            materials[code] = dict(r, _row=n)
        elif r["include_opening"].upper() == "YES":
            lots.append(dict(r, _row=n))
        elif r["include_opening"].upper() not in {"", "NO"}:
            issues.append({"row": n, "message": "include_opening must be YES, NO or blank"})

    # Never silently create a material using a LOT row's unverified metadata.
    for code, r in materials.items():
        n = r["_row"]
        if not r["material_name"] or len(r["material_name"]) > 255:
            issues.append({"row": n, "message": "Material name is required (maximum 255 characters)"})
        if r["material_status"].upper() not in {"ACTIVE", "INACTIVE"}:
            issues.append({"row": n, "message": "material_status must be ACTIVE or INACTIVE"})
        try:
            validate_material_classification(r["category_code"], r["type_code"], r["uom_code"])
        except ValueError as exc:
            issues.append({"row": n, "message": str(exc)})

    existing = {
        m.material_code: m
        for m in db.query(Material).filter(Material.material_code.in_(list(materials))).all()
    } if materials else {}
    for code, r in materials.items():
        m = existing.get(code)
        if not m:
            continue
        n = r["_row"]
        if (m.category_code, m.type_code, m.base_uom_code) != (
            r["category_code"], r["type_code"], r["uom_code"]
        ):
            issues.append({"row": n, "message": f"{code} already exists with different category/type/UOM"})
        if m.name.strip().casefold() != r["material_name"].strip().casefold():
            issues.append({"row": n, "message": f"{code} already exists with a different material name"})
        if (m.status or "").upper() != r["material_status"].upper():
            warnings.append({"row": n, "message": f"{code}: existing material status will be preserved"})

    existing_lots = set()
    if existing:
        for ml in db.query(MaterialLot).filter(
            MaterialLot.material_id.in_([m.id for m in existing.values()])
        ).all():
            code = next((c for c, m in existing.items() if m.id == ml.material_id), None)
            if code is not None:
                existing_lots.add((code, ml.lot_number.casefold()))

    seen = set()
    physical = {}
    valid = []
    total = Decimal("0.00")
    today = date.today()
    expiry_thresholds = {
        (row.category_code, row.type_code): row.threshold_days
        for row in db.query(ExpiryThresholdSetting).filter(
            ExpiryThresholdSetting.is_active.is_(True)
        ).all()
    }
    for r in lots:
        n = r["_row"]
        code = r["material_code"]
        base = materials.get(code)
        if not base:
            issues.append({"row": n, "message": f"Missing MATERIAL definition for {code}"})
            continue
        lot = r["lot_number"].strip()
        status = r["lot_status"].upper()
        if not lot or len(lot) > 100 or lot.upper() in {"BATCH TO CONFIRM", "TO CONFIRM", "N/A"}:
            issues.append({"row": n, "message": "A genuine, confirmed supplier batch number is required"})
        if status not in {"AVAILABLE", "QUARANTINE", "REJECTED"}:
            issues.append({"row": n, "message": "lot_status must be AVAILABLE, QUARANTINE or REJECTED"})
        if not r["qa_verification_reference"] or not r["qa_verified_by"]:
            issues.append({"row": n, "message": "QA verification reference and verifier are required"})
        if not r["cost_source_reference"]:
            issues.append({"row": n, "message": "Cost source/invoice or approved valuation reference is required"})
        if (code, lot.casefold()) in existing_lots:
            issues.append({"row": n, "message": f"Existing StkFlo physical lot {code} / {lot}: import blocked to prevent double-counting"})
        key = (code, lot.casefold(), status)
        if key in seen:
            issues.append({"row": n, "message": f"Duplicate selected lot/status: {code} / {lot} / {status}"})
        seen.add(key)
        try:
            expiry = date.fromisoformat(r["expiry_date"]) if r["expiry_date"] else None
        except ValueError:
            expiry = None
            issues.append({"row": n, "message": "expiry_date must be YYYY-MM-DD"})
        threshold = existing.get(code).auto_quarantine_override_days if code in existing else None
        if threshold is None:
            threshold = expiry_thresholds.get((base["category_code"], base["type_code"]), 0)
        if status == "AVAILABLE" and expiry and expiry <= today + timedelta(days=threshold):
            issues.append({"row": n, "message": "AVAILABLE stock is expired or within the configured auto-quarantine period"})
        info = (expiry, r["lot_manufacturer"].casefold(), r["lot_supplier"].casefold())
        physkey = (code, lot.casefold())
        if physkey in physical and physical[physkey] != info:
            issues.append({"row": n, "message": "Same physical lot has inconsistent expiry/manufacturer/supplier"})
        physical[physkey] = info

        qty = _decimal(r["confirmed_qty"], "confirmed_qty", n, issues, positive=True)
        unit = _decimal(r["original_unit_cost_gbp"], "original_unit_cost_gbp", n, issues) if r["original_unit_cost_gbp"] else None
        value = _decimal(r["current_stock_value_gbp"], "current_stock_value_gbp", n, issues) if r["current_stock_value_gbp"] else None
        if qty is not None and qty.as_tuple().exponent < -6:
            issues.append({"row": n, "message": "Quantities can have at most 6 decimal places"})
        if unit is not None and unit.as_tuple().exponent < -6:
            issues.append({"row": n, "message": "Unit price can have at most 6 decimal places"})
        if unit is None and value is None:
            issues.append({"row": n, "message": "Provide original unit cost or verified current stock value"})
        if qty is None or (unit is None and value is None):
            continue
        calculated = (qty * unit).quantize(MONEY, rounding=ROUND_HALF_UP) if unit is not None else None
        val = value.quantize(MONEY, rounding=ROUND_HALF_UP) if value is not None else calculated
        if value is not None and calculated is not None and abs(val - calculated) > MONEY:
            issues.append({"row": n, "message": "Current stock value disagrees with quantity × original unit cost (greater than £0.01)"})
        derived = (val / qty).quantize(PRICE, rounding=ROUND_HALF_UP)
        if len(str(qty.quantize(QTY)).replace(".", "").replace("-", "")) > 18:
            issues.append({"row": n, "message": "Quantity exceeds StkFlo storage precision"})
        if val > Decimal("999999999999.99") or derived > Decimal("999999999999.999999"):
            issues.append({"row": n, "message": "Stock value or price exceeds storage precision"})
        total += val
        valid.append({
            "row": n, "code": code, "lot": lot, "status": status,
            "expiry": expiry, "qty": qty, "unit": derived,
            "value": val, "supplier": r["lot_supplier"] or base["material_supplier"],
            "manufacturer": r["lot_manufacturer"] or base["material_manufacturer"],
            "cost_ref": r["cost_source_reference"],
            "verify_ref": r["qa_verification_reference"],
            "verified_by": r["qa_verified_by"],
        })
    if not materials:
        issues.append({"row": 0, "message": "At least one MATERIAL row is required"})
    if not lots:
        issues.append({"row": 0, "message": "Select at least one verified LOT row with include_opening=YES"})
    sha = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return {
        "source_sha256": sha, "material_rows": len(materials),
        "materials_to_create": len(materials) - len(existing),
        "existing_materials": len(existing), "opening_lots": len(lots),
        "total_value_gbp": str(total.quantize(MONEY)),
        "blocked": bool(issues), "error_count": len(issues),
        "issues": issues[:150], "warning_count": len(warnings),
        "warnings": warnings[:60],
    }, materials, valid


def _ensure_log_table(db: Session):
    db.execute(text("""
      CREATE TABLE IF NOT EXISTS opening_stock_migrations (
        id BIGSERIAL PRIMARY KEY,
        source_sha256 VARCHAR(64) NOT NULL UNIQUE,
        cutover_date DATE NOT NULL,
        approval_reference VARCHAR(200) NOT NULL,
        approved_by VARCHAR(150) NOT NULL,
        imported_by VARCHAR(100) NOT NULL,
        imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        material_count INTEGER NOT NULL,
        lot_count INTEGER NOT NULL,
        total_value_gbp NUMERIC(18,2) NOT NULL
      )
    """))
    db.execute(text("""
      CREATE TABLE IF NOT EXISTS opening_stock_migration_lines (
        id BIGSERIAL PRIMARY KEY,
        migration_id BIGINT NOT NULL REFERENCES opening_stock_migrations(id),
        stock_transaction_id INTEGER NOT NULL UNIQUE REFERENCES stock_transactions(id),
        material_code VARCHAR(50) NOT NULL,
        lot_number VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        qty NUMERIC(18,6) NOT NULL,
        value_gbp NUMERIC(18,2) NOT NULL,
        cost_source_reference TEXT NOT NULL,
        qa_verification_reference TEXT NOT NULL,
        qa_verified_by TEXT NOT NULL
      )
    """))


@router.post("/preview")
def preview_opening_stock(
    body: PreviewRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("data_migration.view")),
):
    result, _, _ = _evaluate(body.csv_text, db)
    return result


@router.post("/commit")
def commit_opening_stock(
    body: CommitRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("data_migration.commit")),
):
    if body.confirm != "IMPORT OPENING STOCK":
        raise HTTPException(400, "Type IMPORT OPENING STOCK exactly to authorise posting")
    if body.cutover_date > date.today():
        raise HTTPException(400, "Cutover date cannot be in the future")
    if not body.approval_reference.strip() or not body.approved_by.strip():
        raise HTTPException(400, "Approval name and formal approval reference are required")
    try:
        # PostgreSQL transaction-level lock prevents simultaneous import attempts.
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext('stkflo_opening_stock_migration'))"))
        result, material_rows, selected = _evaluate(body.csv_text, db)
        if result["source_sha256"] != body.source_sha256:
            raise HTTPException(409, "File content changed since preview; preview it again")
        if result["blocked"]:
            raise HTTPException(400, {"message": "Migration has blocking validation findings", "issues": result["issues"]})
        _ensure_log_table(db)
        prior = db.execute(text(
            "SELECT id FROM opening_stock_migrations WHERE source_sha256 = :sha"
        ), {"sha": result["source_sha256"]}).scalar_one_or_none()
        if prior:
            raise HTTPException(409, f"This exact migration CSV has already been imported (ID {prior})")

        existing = {
            m.material_code: m for m in db.query(Material).filter(
                Material.material_code.in_(list(material_rows))
            ).all()
        }
        for code, row in material_rows.items():
            if code in existing:
                continue
            m = Material(
                material_code=code, name=row["material_name"],
                category_code=row["category_code"], type_code=row["type_code"],
                base_uom_code=row["uom_code"], status=row["material_status"].upper(),
                manufacturer=row["material_manufacturer"] or None,
                supplier=row["material_supplier"] or None,
                complies_es_criteria=True, created_by=user.username,
            )
            db.add(m)
            db.flush()
            # Mirror the approved manufacturer relation used when creating
            # TABLETS_CAPSULES materials via the Materials Library.
            if m.category_code == "TABLETS_CAPSULES" and m.manufacturer:
                db.add(MaterialApprovedManufacturer(
                    material_id=m.id,
                    manufacturer_name=m.manufacturer,
                    is_active=True,
                    created_by=user.username,
                ))
            existing[code] = m

        migration_id = db.execute(text("""
          INSERT INTO opening_stock_migrations
          (source_sha256,cutover_date,approval_reference,approved_by,imported_by,
           material_count,lot_count,total_value_gbp)
          VALUES (:sha,:cutover,:ref,:approver,:user,:mats,:lots,:value)
          RETURNING id
        """), {
            "sha": result["source_sha256"], "cutover": body.cutover_date,
            "ref": body.approval_reference.strip(), "approver": body.approved_by.strip(),
            "user": user.username, "mats": len(material_rows), "lots": len(selected),
            "value": Decimal(result["total_value_gbp"]),
        }).scalar_one()
        for v in selected:
            material = existing[v["code"]]
            lot = MaterialLot(
                material_id=material.id, lot_number=v["lot"],
                expiry_date=v["expiry"], status=v["status"],
                manufacturer=v["manufacturer"] or None,
                supplier=v["supplier"] or None, created_by=user.username,
            )
            db.add(lot)
            db.flush()
            txn = StockTransaction(
                material_lot_id=lot.id, txn_type="RECEIPT",
                consumption_type="USAGE", qty=v["qty"], uom_code=material.base_uom_code,
                direction=1, unit_price=v["unit"], total_value=v["value"],
                target_ref=f"MIGRATION:{migration_id}",
                comment=f"Legacy opening stock | cutover {body.cutover_date.isoformat()} | {body.approval_reference.strip()}"[:500],
                created_by=user.username, material_status_at_txn=v["status"],
            )
            db.add(txn)
            db.flush()
            db.execute(text("""
              INSERT INTO opening_stock_migration_lines
              (migration_id,stock_transaction_id,material_code,lot_number,status,
               qty,value_gbp,cost_source_reference,qa_verification_reference,qa_verified_by)
              VALUES (:mid,:tid,:code,:lot,:status,:qty,:value,:cost,:verify,:who)
            """), {
                "mid": migration_id, "tid": txn.id,
                "code": v["code"], "lot": v["lot"], "status": v["status"],
                "qty": v["qty"], "value": v["value"],
                "cost": v["cost_ref"], "verify": v["verify_ref"],
                "who": v["verified_by"],
            })
        # Imported legacy MAT codes must not collide with future automatic
        # MAT allocation after a controlled opening-stock cutover.
        if any(code.startswith("MAT") and code[3:].isdigit() for code in material_rows):
            db.execute(text(
                "SELECT setval('material_code_seq', "
                "GREATEST((SELECT last_value FROM material_code_seq), "
                "COALESCE((SELECT MAX(SUBSTRING(material_code FROM 4)::BIGINT) "
                "FROM materials WHERE material_code ~ '^MAT[0-9]+$' "
                "AND LENGTH(material_code) <= 15), 1)), TRUE)"
            ))
        db.commit()
        return {
            "ok": True, "migration_id": migration_id,
            "materials_added": result["materials_to_create"],
            "lots_created": len(selected),
            "total_value_gbp": result["total_value_gbp"],
            "source_sha256": result["source_sha256"],
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


@router.get("/history")
def opening_migration_history(
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("data_migration.view")),
):
    if db.execute(text("SELECT to_regclass('public.opening_stock_migrations')")).scalar() is None:
        return []
    records = db.execute(text("""
      SELECT id, source_sha256, cutover_date, approval_reference, approved_by,
             imported_by, imported_at, material_count, lot_count, total_value_gbp
      FROM opening_stock_migrations ORDER BY id DESC LIMIT 50
    """)).mappings().all()
    return [{k: (v.isoformat() if isinstance(v, (date, datetime)) else str(v) if isinstance(v, Decimal) else v)
             for k, v in row.items()} for row in records]
