"""CSV material catalogue import; deliberately does NOT create any stock ledger rows.

Supports StkFlo's Windows VM and Codespaces deployments with one browser upload.
Existing material identity/classification are preserved; stock and approval status
are never inferred from this historical catalogue.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..material_classification import validate_material_classification
from ..models import Material, MaterialEdit, User
from ..security import require_any_permission

router = APIRouter(prefix="/admin/material-migration", tags=["migration"])
MAX_BYTES = 5_000_000
MAX_ROWS = 6000
REQUIRED = [
    "material_code", "material_name", "category_code", "type_code",
    "base_uom_code", "material_status", "manufacturer", "supplier",
    "low_stock_threshold_qty", "expiry_alert_days",
]


class PreviewInput(BaseModel):
    csv_text: str = Field(..., min_length=1)


class CommitInput(PreviewInput):
    source_sha256: str = Field(..., min_length=64, max_length=64)
    approval_reference: str = Field(..., min_length=3, max_length=200)
    confirm: str


def _parse(csv_text: str):
    if len(csv_text.encode("utf-8")) > MAX_BYTES:
        raise HTTPException(413, "Materials CSV exceeds 5 MB")
    try:
        reader = csv.DictReader(io.StringIO(csv_text.lstrip("\ufeff")), strict=True)
        headings = reader.fieldnames or []
        if len(set(headings)) != len(headings):
            raise ValueError("Duplicate column names")
        missing = set(REQUIRED) - set(headings)
        if missing:
            raise ValueError("Missing columns: " + ", ".join(sorted(missing)))
        rows = []
        for n, record in enumerate(reader, 2):
            if len(rows) >= MAX_ROWS:
                raise ValueError("Over 6,000 materials")
            if None in record:
                raise ValueError(f"CSV row {n} has extra fields")
            rows.append((n, {k: (v or "").strip() for k, v in record.items()}))
        return rows
    except (UnicodeError, csv.Error, ValueError) as exc:
        raise HTTPException(400, f"Invalid materials CSV: {exc}") from exc


def _decimal(value: str, row: int, errors: list[dict]):
    if not value:
        return None
    try:
        d = Decimal(value)
        if not d.is_finite() or d < 0 or d.as_tuple().exponent < -6:
            raise InvalidOperation()
        if d >= Decimal("1000000000000"):
            raise InvalidOperation()
        return d
    except (InvalidOperation, ValueError):
        errors.append({"row": row, "message": "low_stock_threshold_qty must be a non-negative number with up to 6 decimal places"})
        return None


def _evaluate(csv_text: str, db: Session):
    raw_rows = _parse(csv_text)
    errors: list[dict] = []
    warnings: list[dict] = []
    parsed: list[dict] = []
    codes = set()
    for n, r in raw_rows:
        code = r["material_code"].strip()
        name = r["material_name"].strip()
        status = r["material_status"].upper()
        category, kind, uom = r["category_code"], r["type_code"], r["base_uom_code"]
        if not code or len(code) > 50 or code.casefold() == "cancelled bmr":
            errors.append({"row": n, "message": "Invalid or reserved material code"})
            continue
        if code.casefold() in codes:
            errors.append({"row": n, "message": f"Duplicate material code {code}"})
            continue
        codes.add(code.casefold())
        if not name or len(name) > 255:
            errors.append({"row": n, "message": "Material name must be 1-255 characters"})
        if status not in {"ACTIVE", "INACTIVE"}:
            errors.append({"row": n, "message": "material_status must be ACTIVE or INACTIVE"})
        try:
            validate_material_classification(category, kind, uom)
        except ValueError as exc:
            errors.append({"row": n, "message": str(exc)})
        if len(r["manufacturer"]) > 255 or len(r["supplier"]) > 255:
            errors.append({"row": n, "message": "Manufacturer/supplier exceed 255 characters"})
        low_stock = _decimal(r["low_stock_threshold_qty"], n, errors)
        try:
            expiry_days = int(r["expiry_alert_days"])
            if str(expiry_days) != r["expiry_alert_days"] or not 0 <= expiry_days <= 36500:
                raise ValueError()
        except ValueError:
            expiry_days = None
            errors.append({"row": n, "message": "expiry_alert_days must be a non-negative integer (0-36500)"})
        note = r.get("review_notes", "")
        if "REVIEW REQUIRED" in note.upper():
            warnings.append({"row": n, "message": f"{code}: source classification/unit needs review before approval"})
        if not r["manufacturer"] or not r["supplier"]:
            warnings.append({"row": n, "message": f"{code}: manufacturer/supplier unavailable in source; left blank"})
        if low_stock is None:
            warnings.append({"row": n, "message": f"{code}: source minimum stock blank; existing threshold preserved, new left blank"})
        parsed.append({
            "row": n, "material_code": code, "name": name,
            "category_code": category, "type_code": kind,
            "base_uom_code": uom, "status": status,
            "manufacturer": r["manufacturer"] or None,
            "supplier": r["supplier"] or None,
            "low_stock_threshold_qty": low_stock,
            "expiry_alert_days": expiry_days,
        })
    if not parsed:
        errors.append({"row": 0, "message": "CSV contains no materials"})
    existing = {}
    if parsed:
        existing = {m.material_code.casefold(): m for m in
            db.query(Material).filter(
                Material.material_code.in_([r["material_code"] for r in parsed])
            ).all()}
    # BMR formula matching uses material names. Enforce unique canonical names.
    planned_names = {}
    for row in parsed:
        name_key = row["name"].strip().casefold()
        if name_key in planned_names:
            errors.append({"row": row["row"], "message": f"Duplicate material name used by {planned_names[name_key]} and {row['material_code']}"})
        planned_names[name_key] = row["material_code"]
    supplied_codes = {r["material_code"].casefold() for r in parsed}
    for other in db.query(Material).all():
        matching_code = planned_names.get(other.name.strip().casefold())
        if matching_code and matching_code.casefold() != other.material_code.casefold() and other.material_code.casefold() not in supplied_codes:
            errors.append({"row": 0, "message": f"Canonical name already belongs to existing material {other.material_code}: {other.name}"})
    new = updated = 0
    for row in parsed:
        match = existing.get(row["material_code"].casefold())
        if match is None:
            new += 1
            continue
        updated += 1
        n = row["row"]
        if (match.category_code, match.type_code, match.base_uom_code) != (
            row["category_code"], row["type_code"], row["base_uom_code"]
        ):
            errors.append({"row": n, "message": f"{row['material_code']} already exists with different category/type/UOM; resolve before import"})
        if match.name.strip().casefold() != row["name"].strip().casefold():
            warnings.append({"row": n, "message": f"{row['material_code']}: existing material name will be aligned to the uploaded canonical name"})
        if match.status != row["status"]:
            warnings.append({"row": n, "message": f"{row['material_code']}: existing active/inactive status will remain unchanged"})
        if match.manufacturer and row["manufacturer"] and match.manufacturer.casefold() != row["manufacturer"].casefold():
            warnings.append({"row": n, "message": f"{row['material_code']}: existing manufacturer will not be replaced"})
        if match.supplier and row["supplier"] and match.supplier.casefold() != row["supplier"].casefold():
            warnings.append({"row": n, "message": f"{row['material_code']}: existing supplier will not be replaced"})
    sha = hashlib.sha256(csv_text.encode("utf-8")).hexdigest()
    result = {
        "source_sha256": sha, "materials": len(parsed),
        "to_create": new, "existing_to_update": updated,
        "low_stock_populated": sum(x["low_stock_threshold_qty"] is not None for x in parsed),
        "expiry_90_days": sum(x["expiry_alert_days"] == 90 for x in parsed),
        "errors": errors[:250], "error_count": len(errors),
        "warnings": warnings[:250], "warning_count": len(warnings),
        "blocked": bool(errors),
        "stock_receipts": 0,
    }
    return result, parsed, existing


def _ensure_tables(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS material_library_imports (
          id BIGSERIAL PRIMARY KEY,
          source_sha256 VARCHAR(64) NOT NULL UNIQUE,
          imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          imported_by VARCHAR(100) NOT NULL,
          approval_reference VARCHAR(200) NOT NULL,
          materials_created INTEGER NOT NULL,
          materials_updated INTEGER NOT NULL
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS material_library_import_lines (
          id BIGSERIAL PRIMARY KEY,
          import_id BIGINT NOT NULL REFERENCES material_library_imports(id),
          material_code VARCHAR(50) NOT NULL,
          action VARCHAR(20) NOT NULL,
          before_json JSONB,
          after_json JSONB NOT NULL
        )
    """))


def _snapshot(material: Material):
    return {key: (
        str(getattr(material, key)) if isinstance(getattr(material, key), Decimal)
        else getattr(material, key)
    ) for key in (
        "material_code", "name", "category_code", "type_code", "base_uom_code",
        "status", "manufacturer", "supplier", "low_stock_threshold_qty",
        "expiry_alert_days"
    )}


@router.post("/preview")
def preview(body: PreviewInput, db: Session = Depends(get_db),
            _user: User = Depends(require_any_permission("admin.full", "data_migration.view"))):
    return _evaluate(body.csv_text, db)[0]


@router.post("/commit")
def commit(body: CommitInput, db: Session = Depends(get_db),
           user: User = Depends(require_any_permission("admin.full", "data_migration.commit"))):
    if body.confirm != "IMPORT MATERIAL LIBRARY":
        raise HTTPException(400, "Exact confirmation phrase required")
    if not body.approval_reference.strip():
        raise HTTPException(400, "Formal approval reference is required")
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext('stkflo_material_library_import'))"))
        result, rows, existing = _evaluate(body.csv_text, db)
        if result["source_sha256"] != body.source_sha256:
            raise HTTPException(409, "Source CSV changed after preview; please preview again")
        if result["blocked"]:
            raise HTTPException(400, {"message": "Material import validation failed", "errors": result["errors"]})
        _ensure_tables(db)
        duplicate = db.execute(text(
            "SELECT id FROM material_library_imports WHERE source_sha256 = :sha"
        ), {"sha": result["source_sha256"]}).scalar_one_or_none()
        if duplicate:
            raise HTTPException(409, f"This CSV has already been imported (import #{duplicate})")
        import_id = db.execute(text("""
            INSERT INTO material_library_imports
            (source_sha256, imported_by, approval_reference, materials_created, materials_updated)
            VALUES (:sha, :actor, :approval, :added, :updated) RETURNING id
        """), {
            "sha": result["source_sha256"], "actor": user.username,
            "approval": body.approval_reference.strip(),
            "added": result["to_create"], "updated": result["existing_to_update"]
        }).scalar_one()

        for row in rows:
            mat = existing.get(row["material_code"].casefold())
            before = _snapshot(mat) if mat is not None else None
            if mat is None:
                mat = Material(
                    material_code=row["material_code"], name=row["name"],
                    category_code=row["category_code"], type_code=row["type_code"],
                    base_uom_code=row["base_uom_code"], status=row["status"],
                    manufacturer=row["manufacturer"], supplier=row["supplier"],
                    low_stock_threshold_qty=row["low_stock_threshold_qty"],
                    expiry_alert_days=row["expiry_alert_days"],
                    complies_es_criteria=False,
                    created_by=user.username,
                )
                db.add(mat)
                db.flush()
                action = "CREATED"
            else:
                # Keep material codes and classifications immutable; align the
                # reviewed name so subsequent BMR formula imports find it.
                mat.name = row["name"]
                if row["low_stock_threshold_qty"] is not None:
                    mat.low_stock_threshold_qty = row["low_stock_threshold_qty"]
                mat.expiry_alert_days = row["expiry_alert_days"]
                if not mat.manufacturer and row["manufacturer"]:
                    mat.manufacturer = row["manufacturer"]
                if not mat.supplier and row["supplier"]:
                    mat.supplier = row["supplier"]
                db.flush()
                action = "UPDATED"
                after = _snapshot(mat)
                if before != after:
                    db.add(MaterialEdit(
                        material_id=mat.id,
                        edited_by=user.username,
                        edit_reason=f"Materials Library migration #{import_id}: {body.approval_reference.strip()}"[:500],
                        before_json=json.dumps(before, sort_keys=True),
                        after_json=json.dumps(after, sort_keys=True),
                    ))
            db.execute(text("""
              INSERT INTO material_library_import_lines
              (import_id, material_code, action, before_json, after_json)
              VALUES (:iid,:code,:action,CAST(:before AS jsonb),CAST(:after AS jsonb))
            """), {
                "iid": import_id, "code": mat.material_code, "action": action,
                "before": json.dumps(before) if before is not None else None,
                "after": json.dumps(_snapshot(mat)),
            })
        db.commit()
        return {"ok": True, "import_id": import_id,
                "materials_created": result["to_create"],
                "materials_updated": result["existing_to_update"],
                "stock_receipts_created": 0}
    except Exception:
        db.rollback()
        raise


@router.get("/history")
def history(db: Session = Depends(get_db),
            _user: User = Depends(require_any_permission("admin.full", "data_migration.view"))):
    if db.execute(text("SELECT to_regclass('public.material_library_imports')")).scalar() is None:
        return []
    rows = db.execute(text("""
      SELECT id,source_sha256,imported_at,imported_by,approval_reference,
             materials_created,materials_updated
      FROM material_library_imports ORDER BY id DESC LIMIT 50
    """)).mappings().all()
    return [dict(row, imported_at=row["imported_at"].isoformat()) for row in rows]
