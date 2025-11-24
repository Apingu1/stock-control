// src/types.ts

export type LotBalance = {
  material_lot_id: number;
  material_code: string;
  material_name: string;
  lot_number: string;
  expiry_date: string | null;
  status: string;
  manufacturer: string | null;
  supplier: string | null;
  balance_qty: number;
  uom_code: string;
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
  complies_es_criteria: boolean;
  status: string;
};

// Matches enriched ReceiptOut
export type Receipt = {
  id: number;
  material_code: string;
  material_name: string;
  lot_number: string;
  expiry_date: string | null;
  qty: number;
  uom_code: string;
  unit_price: number | null;
  total_value: number | null;
  target_ref: string | null;
  supplier: string | null;
  manufacturer: string | null;
  created_at: string;
  created_by: string;
  comment: string | null;
};

// Matches enriched IssueOut
export type Issue = {
  id: number;
  material_code: string;
  material_name: string;
  lot_number: string;
  expiry_date: string | null;
  qty: number;
  uom_code: string;
  product_batch_no: string;
  manufacturer: string | null;
  supplier: string | null;
  // ⭐ ES batch manufacture date (nullable)
  product_manufacture_date: string | null;
  created_at: string;
  created_by: string;
  comment: string | null;
};

export type ViewMode =
  | "dashboard"
  | "materials"
  | "receipts"
  | "issues"
  | "lots";
