import React from "react";

/** ---------- Types (shared across panels) ---------- */

export type MonthlyRow = {
  month_bucket: string;
  receipt_total_value: string;
  issue_total_value: string;
  receipt_txn_count: number;
  issue_txn_count: number;
  unique_batches_issued: number;
};

export type DashboardLegacyResp = {
  meta: { data_cut: string | null; timezone_month_bucket: string; logic_version: string };
  monthly: MonthlyRow[];
  top_products: { es_product_code: string; unique_batch_count: number; last_issue_at: string | null }[];
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
  };
  by_product: {
    es_product_code: string;
    unique_batches: number;
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
  total_cost: string;
  avg_cost_per_batch: string;
};

export type ProductBatchRow = {
  es_product_code: string;
  product_batch_no: string;
  batch_total_cost: string;
  issue_txn_count: number;
  first_issue_at: string;
  last_issue_at: string;
};

export type BatchAnalyticsResp = {
  header: {
    es_product_code: string;
    product_batch_no: string;
    batch_total_cost: string;
    issue_txn_count: number;
    first_issue_at: string;
    last_issue_at: string;
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
export function dtFmt(v: string | null | undefined) {
  if (!v) return "-";
  try {
    const d = new Date(v);
    return d.toLocaleString();
  } catch {
    return v;
  }
}

/** ---------- Small UI atoms ---------- */

export const Chip: React.FC<{ children: React.ReactNode; variant?: "blue" | "purple" | "green" | "muted" }> = ({
  children,
  variant = "muted",
}) => {
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
};
