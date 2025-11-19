// src/types.ts

export type LotBalance = {
  material_code: string;
  material_name: string;
  lot_number: string;
  expiry_date: string | null;
  status: string;
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

// New: Receipt type (historic goods receipts list)
export type Receipt = {
  id: number;
  material_code: string;
  material_name?: string;
  lot_number: string | null;
  qty: number;
  uom_code: string;
  unit_price?: number | null;
  receipt_date?: string | null; // preferred
  created_at?: string | null;   // fallback
  supplier?: string | null;
  manufacturer?: string | null;
  comment?: string | null;
};

// New: Issue/consumption type
export type Issue = {
  id: number;
  material_code: string;
  material_name?: string;
  lot_number: string;
  qty: number;
  uom_code: string;
  product_batch_no?: string | null;
  product_manufacture_date?: string | null;
  created_at?: string | null;
  comment?: string | null;
};

// New views for menu pages
export type ViewMode =
  | "dashboard"
  | "materials"
  | "receipts"
  | "issues"
  | "lots";
