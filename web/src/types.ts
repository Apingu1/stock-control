// web/src/types.ts

export type ViewMode =
  | "dashboard"
  | "materials"
  | "products"
  | "receipts"
  | "consumption"
  | "lots"
  | "alerts" // ✅ Phase D4: Low Stock & Expiry page
  | "analytics"
  | "quarantine"
  | "admin"
  | "admin-settings"
  | "audit";

export type Role = string;

export type UserMe = {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
};

export type ApprovedManufacturer = {
  id: number;
  manufacturer_name: string;
  is_active: boolean;
};

export type Material = {
  id: number;
  material_code: string;
  name: string;
  category_code: string;
  type_code: string;
  base_uom_code: string;
  manufacturer: string | null;
  supplier: string | null;
  status: string;
  approved_manufacturers?: ApprovedManufacturer[];
  low_stock_threshold_qty?: number | null;
  expiry_alert_days?: number | null;
  auto_quarantine_override_days?: number | null;
  is_cancelled_bmr_marker?: boolean;
};

export type ProductMaterial = {
  id: number;
  material_code: string;
  material_name: string;
  base_uom_code: string;
  status: string;
};

export type Product = {
  id: number;
  product_code: string;
  product_name: string;
  reference: string;
  version_number: string;
  shelf_life_days: number;
  licence_status: "LICENSED" | "UNLICENSED";
  line_type: "STOCK_LINE" | "BESPOKE";
  storage_condition: "FRIDGELINE" | "AMBIENT";
  controlled_drug_status: "CONTROLLED_DRUG" | "N_A";
  export_status: "EXPORT_LINE" | "N_A";
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  materials: ProductMaterial[];
};

export type Receipt = {
  id: number;
  created_at: string;
  receipt_date?: string | null;

  material_code: string;
  material_name: string;

  lot_number: string;
  expiry_date: string | null;

  qty: number;
  uom_code: string;

  unit_price: number | null;
  total_value: number | null;

  supplier: string | null;
  manufacturer: string | null;

  complies_es_criteria?: boolean | null;

  comment: string | null;
  target_ref: string | null;

  created_by: string | null;
};

export type Issue = {
  id: number;
  created_at: string;

  material_code: string;
  material_name: string;

  lot_number: string;
  expiry_date: string | null;

  qty: number;
  uom_code: string;

  consumption_type: string | null;

  // ✅ NEW (Phase D5): ES product code (links ES Batch to a product code, e.g. DULO2)
  es_product_code?: string | null;

  product_batch_no: string | null;
  product_manufacture_date: string | null;

  // Shared fields for multi-material consumption submissions.
  consumption_group_id?: string | null;
  total_batch_size?: number | string | null;
  batch_size_uom?: string | null;
  number_of_units?: number | null;

  manufacturer: string | null;
  supplier?: string | null;

  comment: string | null;

  material_status_at_txn?: string | null;

  created_by: string | null;

  // ✅ ADDITIVE (D2 costing): populated by backend on ISSUE transactions
  unit_price?: number | null;
  total_value?: number | null;
  product_name_snapshot?: string | null;
  product_reference_snapshot?: string | null;
  product_version_snapshot?: string | null;
  batch_disposition?: "COMPLIANT" | "REJECTED" | "CANCELLED" | string;
  disposition_reason?: string | null;
  compliance_triggers?: string[];
  missing_material_codes?: string[];
  unexpected_material_codes?: string[];
  approved_by?: string | null;
  is_non_stock_record?: boolean;
};

export type LotBalance = {
  material_lot_id: number;

  material_code: string;
  material_name: string;

  category_code?: string | null;
  type_code?: string | null;

  lot_number: string;
  expiry_date: string | null;

  status: string;

  manufacturer?: string | null;
  supplier?: string | null;

  balance_qty: number;
  uom_code: string;

  last_status_reason?: string | null;
  last_status_changed_at?: string | null;

  lot_unit_price?: number | null;
  lot_value?: number | null;

  // ✅ ADDITIVE (Phase D3): derived expiry helper fields for tooltip/transparency
  days_to_expiry?: number | null;
  expiry_threshold_days?: number | null;
};

export type AdminRole = {
  name: string;
  description?: string | null;
  is_active?: boolean;
};

export type PermissionDef = {
  key: string;
  description?: string | null;
};

export type RolePermissionRow = {
  permission_key: string;
  granted: boolean;
};

export type AuditEvent = {
  event_type: string;
  event_at: string;
  actor_username?: string | null;
  target_type?: string | null;
  target_ref?: string | null;
  reason?: string | null;
  before_json?: any;
  after_json?: any;
};

// ✅ ADDITIVE (Phase D3): Admin Settings -> expiry threshold rows
export type ExpiryThresholdRow = {
  id: number;
  category_code: string;
  type_code: string;
  threshold_days: number;
  is_active: boolean;
  updated_at: string;
  updated_by?: string | null;
};

export type ExpiryThresholdPatch = {
  threshold_days?: number;
  is_active?: boolean;
};

export type DashboardSummary = {
  total_materials: number;
  materials_low_expiry: number;
  materials_low_stock: number;
  batches_manufactured_today: number;
  receipts_today: number;
  total_material_value: number;
  rejected_batches_today?: number;
  cancelled_batches_today?: number;
};

export type QuarantinePolicy = {
  allow_issue_from_quarantine: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type QuarantineLogRow = {
  id: string;
  event_at: string;
  event_type: string;

  material_code: string;
  material_name?: string | null;
  lot_number: string;

  qty: number;
  uom_code?: string | null;

  from_status?: string | null;
  to_status?: string | null;

  reason?: string | null;
  created_by?: string | null;

  source_material_lot_id?: number | null;
  dest_material_lot_id?: number | null;
  source?: string | null;
};
