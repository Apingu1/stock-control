from datetime import datetime, date
from typing import Optional, List

from pydantic import BaseModel, Field


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
    material_code: str = Field(
        ...,
        description="Canonical material code, e.g. MAT0327",
    )
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
    """
    Fields that can be updated for an existing material.
    We don't allow material_code changes via this endpoint.
    """

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

    # NEW: approved manufacturers (if any)
    approved_manufacturers: List[ApprovedManufacturerOut] = []

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
    receipt_date: date
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
    material_name: str
    lot_number: str
    expiry_date: Optional[datetime] = None
    qty: float
    uom_code: str
    unit_price: Optional[float] = None
    total_value: Optional[float] = None
    target_ref: Optional[str] = None  # GRN / invoice ref
    supplier: Optional[str] = None
    manufacturer: Optional[str] = None
    created_at: datetime
    created_by: str
    comment: Optional[str] = None

    class Config:
        from_attributes = True

# --- Issues (Used) -----------------------------------------------------------


class IssueCreate(BaseModel):
    """
    One row from your 'Used' tab.'
    """

    material_code: str
    lot_number: str
    qty: float
    uom_code: str
    # ES batch number / R&D ref (now stored in DB)
    product_batch_no: Optional[str] = None
    product_manufacture_date: Optional[datetime] = None
    # Consumption type:
    #  - USAGE       → batch usage (ES batch required)
    #  - WASTAGE     → wastage/spillage
    #  - DESTRUCTION → destruction of stock
    #  - R_AND_D     → R&D usage (ES batch optional)
    consumption_type: str = "USAGE"
    # Optional reference (e.g. worksheet ref, internal ref)
    target_ref: Optional[str] = None
    created_by: str
    comment: Optional[str] = None


class IssueOut(BaseModel):
    id: int
    material_code: str
    material_name: str
    lot_number: str
    expiry_date: Optional[datetime] = None
    qty: float
    uom_code: str
    # Stored on stock_transactions from now on
    product_batch_no: Optional[str] = None
    manufacturer: Optional[str] = None
    supplier: Optional[str] = None
    # For display on the Consumption page
    product_manufacture_date: Optional[datetime] = None
    # Consumption type (USAGE / WASTAGE / DESTRUCTION / R_AND_D)
    consumption_type: str
    # Optional reference (e.g. worksheet ref, internal ref)
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
    material_name: str
    lot_number: str
    expiry_date: Optional[date]
    status: str
    manufacturer: Optional[str] = None
    supplier: Optional[str] = None
    balance_qty: float
    uom_code: str

    class Config:
        from_attributes = True
