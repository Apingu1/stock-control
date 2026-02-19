# app/schemas.py
from datetime import datetime, date
from typing import Optional, List, Any
from decimal import Decimal

from pydantic import BaseModel, Field, condecimal

# ---------------------------------------------------------------------------
# Decimal standards (GMP / ALCOA+ accuracy)
# ---------------------------------------------------------------------------
# Quantities and stored costing columns are NUMERIC(18,6) in DB.
Dec6 = condecimal(max_digits=18, decimal_places=6)


class ApiBaseModel(BaseModel):
    class Config:
        # Ensures Decimal values remain exact when serialized (no float drift)
        json_encoders = {Decimal: str}
        orm_mode = True  # Pydantic v1 alias; safe to keep


# ---------------------------------------------------------------------------
# AUTH (Phase A)
# ---------------------------------------------------------------------------

class LoginRequest(ApiBaseModel):
    username: str
    password: str


class TokenOut(ApiBaseModel):
    access_token: str
    token_type: str = "bearer"


class UserMeOut(ApiBaseModel):
    id: int
    username: str
    role: str
    is_active: bool


class UserOut(ApiBaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    created_at: datetime
    created_by: Optional[str] = None

    class Config:
        from_attributes = True
        json_encoders = {Decimal: str}


class UserCreate(ApiBaseModel):
    username: str
    password: str
    role: str = "OPERATOR"
    is_active: bool = True


class UserUpdate(ApiBaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


# --- Approved manufacturers ---------------------------------------------------

class ApprovedManufacturerBase(ApiBaseModel):
    manufacturer_name: str
    is_active: bool = True


class ApprovedManufacturerCreate(ApprovedManufacturerBase):
    created_by: Optional[str] = None
    # ✅ GMP: mandatory reason (enforced in backend) for add/remove changes
    edit_reason: Optional[str] = None


class ApprovedManufacturerOut(ApprovedManufacturerBase):
    id: int
    created_at: datetime
    created_by: Optional[str] = None

    class Config:
        from_attributes = True
        json_encoders = {Decimal: str}


# --- Materials ---------------------------------------------------------------

class MaterialBase(ApiBaseModel):
    material_code: str = Field(..., description="Canonical material code, e.g. MAT0327")
    name: str
    category_code: str
    type_code: str
    base_uom_code: str
    manufacturer: Optional[str] = None
    supplier: Optional[str] = None
    complies_es_criteria: bool = True
    status: str = "ACTIVE"
    # Phase D4: per-material alerts & auto-quarantine override (nullable)
    low_stock_threshold_qty: Optional[Dec6] = Field(None, ge=0)
    expiry_alert_days: Optional[int] = Field(None, ge=0)
    auto_quarantine_override_days: Optional[int] = Field(None, ge=0)


class MaterialCreate(MaterialBase):
    created_by: Optional[str] = None


class MaterialUpdate(ApiBaseModel):
    name: str
    category_code: str
    type_code: str
    base_uom_code: str
    manufacturer: Optional[str] = None
    supplier: Optional[str] = None
    complies_es_criteria: bool = True
    status: str = "ACTIVE"

    # ✅ NEW: required for audit-trailed edits (PUT /materials/{material_code})
    edit_reason: Optional[str] = None

    # Phase D4: per-material alerts & auto-quarantine override (nullable)
    low_stock_threshold_qty: Optional[Dec6] = Field(None, ge=0)
    expiry_alert_days: Optional[int] = Field(None, ge=0)
    auto_quarantine_override_days: Optional[int] = Field(None, ge=0)


class MaterialOut(MaterialBase):
    id: int
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None

    approved_manufacturers: List[ApprovedManufacturerOut] = []

    class Config:
        from_attributes = True
        json_encoders = {Decimal: str}


# --- Receipts (Purchased) ----------------------------------------------------

class ReceiptCreate(ApiBaseModel):
    material_code: str
    lot_number: str
    expiry_date: Optional[datetime] = None
    receipt_date: date
    qty: Dec6
    uom_code: str
    unit_price: Optional[Dec6] = None
    total_value: Optional[Dec6] = None
    target_ref: Optional[str] = None
    supplier: Optional[str] = None
    manufacturer: Optional[str] = None
    complies_es_criteria: Optional[bool] = True

    # Phase A: client may send, but server will override from JWT user.
    created_by: Optional[str] = None

    comment: Optional[str] = None


# ✅ NEW: used for edits (PUT /receipts/{id})
class ReceiptUpdate(ApiBaseModel):
    """
    Edit an existing RECEIPT transaction.
    Audit reason is mandatory.
    """
    qty: Dec6
    unit_price: Optional[Dec6] = None
    total_value: Optional[Dec6] = None
    target_ref: Optional[str] = None
    comment: Optional[str] = None
    receipt_date: Optional[date] = None
    lot_number: Optional[str] = None  # superuser-only
    expiry_date: Optional[date] = None  # superuser-only
    force_merge: Optional[bool] = False  # superuser-only (for lot rename collision)
    edit_reason: str


class ReceiptOut(ApiBaseModel):
    id: int
    material_code: str
    material_name: str
    lot_number: str
    expiry_date: Optional[datetime] = None
    qty: Dec6
    uom_code: str
    unit_price: Optional[Dec6] = None
    total_value: Optional[Dec6] = None
    target_ref: Optional[str] = None
    supplier: Optional[str] = None
    manufacturer: Optional[str] = None
    complies_es_criteria: Optional[bool] = None
    created_at: datetime
    created_by: str
    comment: Optional[str] = None

    class Config:
        from_attributes = True
        json_encoders = {Decimal: str}


# --- Issues (Used) -----------------------------------------------------------

class IssueCreate(ApiBaseModel):
    """
    One row from your 'Used' tab.
    """
    material_code: str
    lot_number: str

    # preferred for split-lots (exact segment)
    material_lot_id: Optional[int] = None

    qty: Dec6
    uom_code: str
    es_product_code: Optional[str] = None  # ES Product Code (e.g., DULO2)
    product_batch_no: Optional[str] = None
    product_manufacture_date: Optional[datetime] = None
    consumption_type: str = "USAGE"
    target_ref: Optional[str] = None

    # Phase A: client may send, but server will override from JWT user.
    created_by: Optional[str] = None

    comment: Optional[str] = None


# ✅ NEW: used for edits (PUT /issues/{id})
class IssueUpdate(ApiBaseModel):
    """
    Edit an existing ISSUE transaction.
    Audit reason is mandatory.
    """
    qty: Dec6
    uom_code: Optional[str] = None  # optional; most sites keep UOM fixed on edit, but safe.
    es_product_code: Optional[str] = None
    product_batch_no: Optional[str] = None
    product_manufacture_date: Optional[datetime] = None
    consumption_type: str = "USAGE"
    target_ref: Optional[str] = None
    comment: Optional[str] = None
    edit_reason: str


class IssueOut(ApiBaseModel):
    id: int
    material_code: str
    material_name: str
    lot_number: str
    expiry_date: Optional[datetime] = None
    qty: Dec6
    uom_code: str
    es_product_code: Optional[str] = None

    # ✅ Costing (stored on ISSUE txn at time of posting)
    unit_price: Optional[Dec6] = None
    total_value: Optional[Dec6] = None

    product_batch_no: Optional[str] = None
    manufacturer: Optional[str] = None
    supplier: Optional[str] = None
    product_manufacture_date: Optional[datetime] = None
    consumption_type: str
    target_ref: Optional[str] = None
    created_at: datetime
    created_by: str
    comment: Optional[str] = None

    # ✅ NEW: snapshot column so UI can show "Status at time of usage"
    material_status_at_txn: Optional[str] = None

    class Config:
        from_attributes = True
        json_encoders = {Decimal: str}


# --- Lot balances (view) -----------------------------------------------------

class LotBalanceOut(ApiBaseModel):
    material_lot_id: int
    material_code: str
    category_code: str
    type_code: str
    material_name: str
    lot_number: str
    expiry_date: Optional[date]
    status: str
    manufacturer: Optional[str] = None
    supplier: Optional[str] = None
    balance_qty: Dec6
    uom_code: str

    # ✅ Costing (per-lot; derived from receipts)
    lot_unit_price: Optional[Dec6] = None
    lot_value: Optional[Dec6] = None

    last_status_reason: Optional[str] = None
    last_status_changed_at: Optional[datetime] = None

    # ✅ Phase D3: expiry-derived helper fields (for UI tooltip + transparency)
    days_to_expiry: Optional[int] = None
    expiry_threshold_days: Optional[int] = None

    class Config:
        from_attributes = True
        json_encoders = {Decimal: str}


class LotStatusChangeCreate(ApiBaseModel):
    new_status: str
    reason: str

    # Phase A: client may send, but server will override from JWT user.
    changed_by: Optional[str] = None

    whole_lot: bool = True
    move_qty: Optional[Dec6] = None


# --- RBAC (Phase B) ----------------------------------------------------------
# Compatibility note:
# admin.py expects RolePermissionOut / RolePermissionsOut etc.
# We define these explicitly and also keep "Item" naming for UI convenience.

class RoleOut(ApiBaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True

    class Config:
        from_attributes = True
        json_encoders = {Decimal: str}


class RoleCreate(ApiBaseModel):
    name: str = Field(..., description="Role name (will be uppercased)")
    description: Optional[str] = None
    is_active: bool = True


class RoleUpdate(ApiBaseModel):
    description: Optional[str] = None
    is_active: Optional[bool] = None


class PermissionOut(ApiBaseModel):
    key: str
    description: Optional[str] = None

    class Config:
        from_attributes = True
        json_encoders = {Decimal: str}


# Single permission toggle row (what admin.py likely wants)
class RolePermissionOut(ApiBaseModel):
    permission_key: str
    granted: bool


# Alias (some UI code prefers this name)
RolePermissionItem = RolePermissionOut


class RolePermissionsOut(ApiBaseModel):
    role_name: str
    permissions: List[RolePermissionOut]


class RolePermissionsUpdate(ApiBaseModel):
    permissions: List[RolePermissionOut]


class RolePermissionSet(ApiBaseModel):
    """
    UI currently sends: { role: "READ ONLY", permissions: [...] }
    But the canonical role name is taken from the URL:
      PUT /admin/roles/{role_name}/permissions

    So we do NOT require role_name in the body.
    We accept optional role for UI/backwards compatibility.
    """
    role: Optional[str] = None
    permissions: List[RolePermissionOut]


class MyPermissionsOut(ApiBaseModel):
    role: str
    permissions: List[str]


# --- Audit feed (unified view) ----------------------------------------------

class AuditEventOut(ApiBaseModel):
    # NOTE: audit router returns these keys from SQL:
    # event_type, event_at, actor_username, target_type, target_ref, reason, before_json, after_json
    event_type: str
    event_at: datetime
    actor_username: Optional[str] = None
    target_type: Optional[str] = None
    target_ref: Optional[str] = None
    reason: Optional[str] = None
    before_json: Optional[Any] = None
    after_json: Optional[Any] = None


# --- Phase D3: Expiry threshold settings (admin page) -------------------------

class ExpiryThresholdSettingOut(ApiBaseModel):
    id: int
    category_code: str
    type_code: str
    threshold_days: int
    is_active: bool
    updated_at: datetime
    updated_by: Optional[str] = None

    class Config:
        from_attributes = True
        json_encoders = {Decimal: str}


class ExpiryThresholdSettingUpdate(ApiBaseModel):
    threshold_days: Optional[int] = None
    is_active: Optional[bool] = None


# ---------------------------------------------------------------------------
# ALERTS (Phase D4+: Server-persisted alert actions)
# ---------------------------------------------------------------------------

class AlertActionBase(ApiBaseModel):
    alert_key: str
    alert_type: str  # LOW_STOCK / LOW_EXPIRY
    material_code: str
    lot_number: Optional[str] = None

    state: str  # NEW/ACKNOWLEDGED/ON_ORDER/DELAYED/UNAVAILABLE/NOT_REQUIRED
    eta_text: Optional[str] = None
    last_seen_available_qty: Optional[Dec6] = None


class AlertActionUpsert(AlertActionBase):
    pass


class AlertActionOut(AlertActionBase):
    id: int
    created_at: datetime
    updated_at: datetime
    updated_by: Optional[str] = None

    class Config:
        from_attributes = True
        json_encoders = {Decimal: str}


# ---------------------------------------------------------------------------
# QUARANTINE LEDGER (V29+)
# Additive only: does not change core stock logic, just enables log/policy I/O.
# ---------------------------------------------------------------------------

class QuarantinePolicyOut(ApiBaseModel):
    allow_issue_from_quarantine: bool
    updated_at: datetime
    updated_by: Optional[str] = None

    class Config:
        from_attributes = True
        json_encoders = {Decimal: str}


class QuarantinePolicyUpdate(ApiBaseModel):
    allow_issue_from_quarantine: bool


class QuarantineLogRow(ApiBaseModel):
    id: str
    event_at: datetime
    event_type: str  # STATUS_CHANGE / DESTRUCTION

    material_code: str
    material_name: Optional[str] = None
    lot_number: str

    qty: Dec6
    uom_code: str

    from_status: Optional[str] = None
    to_status: Optional[str] = None

    reason: Optional[str] = None
    created_by: str

    # For traceability across splits/merges
    source_material_lot_id: Optional[int] = None
    dest_material_lot_id: Optional[int] = None

    source: str = "RECORDED"

    class Config:
        from_attributes = True
        json_encoders = {Decimal: str}


class QuarantineLogOut(ApiBaseModel):
    rows: List[QuarantineLogRow]
