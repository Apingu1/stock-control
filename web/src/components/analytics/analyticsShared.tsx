import React from "react";

/** ---------- Types (shared across panels) ---------- */

export type MonthlyRow = {
  month_bucket: string;
  receipt_total_value: string;
  issue_total_value: string;
  receipt_txn_count: number;
  issue_txn_count: number;
  unique_batches_issued: number;
  rejected_batches?: number;
  cancelled_batches?: number;
};

export type DashboardLegacyResp = {
  meta: { data_cut: string | null; timezone_month_bucket: string; logic_version: string };
  monthly: MonthlyRow[];
  top_products: {
    es_product_code: string;
    unique_batch_count: number;
    compliant_batch_count: number;
    rejected_batch_count: number;
    cancelled_batch_count: number;
    last_issue_at: string | null;
  }[];
};

export type DashboardRangeResp = {
  meta: { data_cut: string | null; timezone_day_bounds: string; logic_version: string };
  range: { date_from: string | null; date_to: string | null };
  kpis: {
    receipt_total_value: string;
    issue_total_value: string;
    receipt_txn_count: number;
    issue_txn_count: number;
    unique_batches_issued: number;
    rejected_batches: number;
    cancelled_batches: number;
  };
  by_product: {
    es_product_code: string;
    unique_batches: number;
    total_recorded_batches: number;
    rejected_batches: number;
    cancelled_batches: number;
    total_cost: string;
    avg_cost_per_batch: string;
    issue_txn_count: number;
    first_issue_at: string | null;
    last_issue_at: string | null;
  }[];
  by_material: {
    material_code: string;
    material_name: string | null;
    uom_code: string | null;
    unique_batches: number;
    rejected_batches: number;
    total_cost: string;
    avg_cost_per_batch: string;
    issue_qty_total: string;
    issue_txn_count: number;
    first_issue_at: string | null;
    last_issue_at: string | null;
  }[];
  monthly: MonthlyRow[];
};

export type DashboardResp = DashboardLegacyResp | DashboardRangeResp;

export type ProductSummary = {
  es_product_code: string;
  unique_batches: number;
  total_recorded_batches: number;
  rejected_batches: number;
  cancelled_batches: number;
  total_cost: string;
  avg_cost_per_batch: string;
};

export type ProductBatchRow = {
  es_product_code: string;
  product_batch_no: string;
  customer_name: string | null;
  total_batch_size: string | null;
  batch_size_uom: string | null;
  number_of_units: number | null;
  batch_total_cost: string;
  issue_txn_count: number;
  first_issue_at: string;
  last_issue_at: string;
  product_name: string | null;
  product_reference: string | null;
  product_version: string | null;
  batch_disposition: "COMPLIANT" | "REJECTED" | "CANCELLED" | string;
  disposition_reason: string | null;
  compliance_triggers: string[];
  missing_material_codes: string[];
  unexpected_material_codes: string[];
  created_by: string | null;
  approved_by: string | null;
  consumption_group_id: string | null;
};

export type BatchAnalyticsResp = {
  header: {
    es_product_code: string;
    product_batch_no: string;
    customer_name: string | null;
    batch_total_cost: string;
    issue_txn_count: number;
    first_issue_at: string;
    last_issue_at: string;
    total_batch_size: string | null;
    batch_size_uom: string | null;
    number_of_units: number | null;
    product_name: string | null;
    product_reference: string | null;
    product_version: string | null;
    batch_disposition: "COMPLIANT" | "REJECTED" | "CANCELLED" | string;
    disposition_reason: string | null;
    compliance_triggers: string[];
    missing_material_codes: string[];
    unexpected_material_codes: string[];
    created_by: string | null;
    approved_by: string | null;
    consumption_group_id: string | null;
  };
  materials: {
    stock_txn_id: number;
    created_at: string;
    created_by: string | null;
    material_code: string;
    material_name: string;
    lot_number: string;
    qty: string;
    uom_code: string;
    unit_price: string | null;
    total_value: string | null;
  }[];
};

export type MaterialMonthlyRow = {
  material_code: string;
  material_name: string;
  month_bucket: string;
  issue_qty_sum: string;
  issue_value_sum: string;
  receipt_qty_sum: string;
  receipt_value_sum: string;
  issue_txn_count: number;
  receipt_txn_count: number;
};

export type MaterialSummary = {
  material_code: string;
  material_name: string;
  uom_code: string | null;
  window_months: number | null;
  issue_qty_total: string;
  issue_value_total: string;
  receipt_qty_total: string;
  receipt_value_total: string;
  avg_daily_usage: string;
  lead_time_days: number | null;
  safety_factor: string;
  suggested_low_stock_threshold: string;
  calc_notes: string[];
};

export type DashView = "product" | "material";
export type DashSort = "most_batches" | "least_batches" | "highest_avg_cost" | "lowest_avg_cost";

export function isRangeDash(d: DashboardResp | null): d is DashboardRangeResp {
  return !!d && (d as any).kpis !== undefined;
}

/** ---------- Formatting helpers ---------- */

export function money(v: string | null | undefined) {
  if (!v) return "£0.00";
  const n = Number(v);
  if (Number.isNaN(n)) return `£${v}`;
  return n.toLocaleString(undefined, { style: "currency", currency: "GBP" });
}

export function qtyFmt(v: string | null | undefined) {
  if (!v) return "0";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function dmyFmt(ymd: string | null | undefined) {
  if (!ymd) return "";
  const s = String(ymd);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function dtFmt(v: string | null | undefined) {
  if (!v) return "-";

  const raw = String(v);
  const normalized = raw.replace(/\.(\d{3})\d+/, ".$1");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return raw;

  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** ---------- Small UI atoms ---------- */

export const Chip: React.FC<{
  children: React.ReactNode;
  variant?: "blue" | "purple" | "green" | "muted";
}> = ({ children, variant = "muted" }) => {
  const cls =
    variant === "blue"
      ? "analytics-chip analytics-chip-blue"
      : variant === "purple"
        ? "analytics-chip analytics-chip-purple"
        : variant === "green"
          ? "analytics-chip analytics-chip-green"
          : "analytics-chip";
  return <span className={cls}>{children}</span>;
};

export type MaterialLotRow = {
  material_lot_id: number;
  lot_number: string;
  status: string;
  current_qty: string;
  expiry_date: string | null;
  first_txn_at: string | null;
  last_txn_at: string | null;
};

export type MaterialTraceRow = {
  product_batch_no: string;
  es_product_code: string;
  issue_qty_sum: string;
  issue_value_sum: string;
  last_issue_at: string | null;
  lot_number?: string | null;
  batch_disposition?: string;
  disposition_reason?: string | null;
};
