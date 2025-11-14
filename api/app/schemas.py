from datetime import datetime, date
from typing import Optional, List

from pydantic import BaseModel, Field


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


class MaterialOut(MaterialBase):
    id: int
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None

    class Config:
        from_attributes = True


# --- Receipts (Purchased) ----------------------------------------------------

class ReceiptCreate(BaseModel):
    """
    One GRN line, i.e. a row from your 'Purchased' tab.
    """
    material_code: str
    lot_number: str
    expiry_date: Optional[datetime] = None
    qty: float
    uom_code: str
    unit_price: Optional[float] = None
    total_value: Optional[float] = None
    target_ref: Optional[str] = None  # GRN / invoice ref
    supplier: Optional[str] = None
    manufacturer: Optional[str] = None
    complies_es_criteria: Optional[bool] = True
    created_by: str
    comment: Optional[str] = None


class ReceiptOut(BaseModel):
    id: int
    material_code: str
    lot_number: str
    qty: float
    uom_code: str
    target_ref: Optional[str]
    created_at: datetime
    created_by: str

    class Config:
        from_attributes = True


# --- Issues (Used) -----------------------------------------------------------

class IssueCreate(BaseModel):
    """
    One row from your 'Used' tab.
    """
    material_code: str
    lot_number: str
    qty: float
    uom_code: str
    product_batch_no: str               # ES batch number
    product_manufacture_date: Optional[datetime] = None
    created_by: str
    comment: Optional[str] = None


class IssueOut(BaseModel):
    id: int
    material_code: str
    lot_number: str
    qty: float
    uom_code: str
    product_batch_no: str
    created_at: datetime
    created_by: str

    class Config:
        from_attributes = True


# --- Lot balances (view) -----------------------------------------------------

class LotBalanceOut(BaseModel):
    material_code: str
    material_name: str
    lot_number: str
    expiry_date: Optional[date]
    status: str
    balance_qty: float
    uom_code: str

    class Config:
        from_attributes = True
