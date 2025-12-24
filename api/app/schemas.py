# app/schemas.py
from datetime import datetime, date
from typing import Optional, List

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# AUTH (Phase A)
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserMeOut(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    created_at: datetime
    created_by: Optional[str] = None

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "OPERATOR"
    is_active: bool = True


class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


# --- Approved manufacturers ---------------------------------------------------

class ApprovedManufacturerBase(BaseModel):
    manufacturer_name: str
    is_active: bool = True


class ApprovedManufacturerCreate(ApprovedManufacturerBase):
    created_by: Optional[str] = None


class ApprovedManufacturerOut(ApprovedManufacturerBase):
    id: int
    created_at: datetime
    created_by: Optional[str] = None

    class Config:
        from_attributes = True


# --- Materials ---------------------------------------------------------------

class MaterialBase(BaseModel):
    material_code: str = Field(..., description="Canonical material code, e.g. MAT0327")
    name: str
    category_code: str
    type_code: str
    base_uom_code: str
    manufacturer: Optional[str] = None
    supplier: Optional[str] = None
    complies_es_criteria: bool = True
    status: str = "ACTIVE"


class MaterialCreate(MaterialBase):
    created_by: Optional[str] = None


class MaterialUpdate(BaseModel):
    name: str
    category_code: str
    type_code: str
    base_uom_code: str
    manufacturer: Optional[str] = None
    supplier: Optional[str] = None
    complies_es_criteria: bool = True
    status: str = "ACTIVE"


class MaterialOut(MaterialBase):
    id: int
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None

    approved_manufacturers: List[ApprovedManufacturerOut] = []

    class Config:
        from_attributes = True


# --- Receipts (Purchased) ----------------------------------------------------

class ReceiptCreate(BaseModel):
    material_code: str
    lot_number: str
    expiry_date: Optional[datetime] = None
    receipt_date: date
    qty: float
    uom_code: str
    unit_price: Optional[float] = None
    total_value: Optional[float] = None
    target_ref: Optional[str] = None
    supplier: Optional[str] = None
    manufacturer: Optional[str] = None
    complies_es_criteria: Optional[bool] = True

    # Phase A: client may send, but server will override from JWT user.
    created_by: Optional[str] = None

    comment: Optional[str] = None


class ReceiptOut(BaseModel):
    id: int
    material_code: str
    material_name: str
    lot_number: str
    expiry_date: Optional[datetime] = None
    qty: float
    uom_code: str
    unit_price: Optional[float] = None
    total_value: Optional[float] = None
    target_ref: Optional[str] = None
    supplier: Optional[str] = None
    manufacturer: Optional[str] = None
    complies_es_criteria: Optional[bool] = None
    created_at: datetime
    created_by: str
    comment: Optional[str] = None

    class Config:
        from_attributes = True


# --- Issues (Used) -----------------------------------------------------------

class IssueCreate(BaseModel):
    """
    One row from your 'Used' tab.
    """
    material_code: str
    lot_number: str

    # preferred for split-lots (exact segment)
    material_lot_id: Optional[int] = None

    qty: float
    uom_code: str
    product_batch_no: Optional[str] = None
    product_manufacture_date: Optional[datetime] = None
    consumption_type: str = "USAGE"
    target_ref: Optional[str] = None

    # Phase A: client may send, but server will override from JWT user.
    created_by: Optional[str] = None

    comment: Optional[str] = None


class IssueOut(BaseModel):
    id: int
    material_code: str
    material_name: str
    lot_number: str
    expiry_date: Optional[datetime] = None
    qty: float
    uom_code: str
    product_batch_no: Optional[str] = None
    manufacturer: Optional[str] = None
    supplier: Optional[str] = None
    product_manufacture_date: Optional[datetime] = None
    consumption_type: str
    target_ref: Optional[str] = None
    created_at: datetime
    created_by: str
    comment: Optional[str] = None

    class Config:
        from_attributes = True


# --- Lot balances (view) -----------------------------------------------------

class LotBalanceOut(BaseModel):
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
    balance_qty: float
    uom_code: str

    last_status_reason: Optional[str] = None
    last_status_changed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LotStatusChangeCreate(BaseModel):
    new_status: str
    reason: str

    # Phase A: client may send, but server will override from JWT user.
    changed_by: Optional[str] = None

    whole_lot: bool = True
    move_qty: Optional[float] = None
