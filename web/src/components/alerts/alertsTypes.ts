// web/src/components/alerts/alertsTypes.ts
import type { Material } from "../../types";

export type AlertState =
  | "NEW"
  | "ACKNOWLEDGED"
  | "ON_ORDER"
  | "DELAYED"
  | "UNAVAILABLE"
  | "NOT_REQUIRED";

export type AlertAction = {
  state: AlertState;
  eta_text?: string;
  updated_at?: string;
  last_seen_available_qty?: number;
};

export type AlertType = "LOW_STOCK" | "LOW_EXPIRY";

export type ParsedKey = {
  type: AlertType;
  material: string;
  lot?: string;
};

export type LowStockRow = {
  key: string;
  material_code: string;
  name: string;
  category_code: string;
  type_code: string;
  base_uom_code: string;
  available_qty: number;
  threshold_qty: number;
  severity: "warn" | "critical";
  action: AlertAction;
};

export type LowExpiryRow = {
  key: string;
  material_code: string;
  name: string;
  category_code: string;
  type_code: string;
  lot_number: string;
  expiry_date: string;
  days_to_expiry: number;
  alert_days: number;
  days_to_quarantine: number | null;
  qty: number;
  severity: "warn" | "critical";
  action: AlertAction;
};

export type UpsertMeta = {
  alert_type: AlertType;
  material_code: string;
  lot_number?: string | null;
  last_seen_available_qty?: number | null;
};

export type LowStockSortMode = "SEVERITY" | "LOWEST_AVAILABLE" | "STATUS_PRIORITY" | "MATERIAL";
export type LowExpirySortMode = "SOONEST_AQ" | "SOONEST_EXPIRY" | "STATUS_PRIORITY" | "MATERIAL";

export const STATE_OPTIONS: { value: AlertState; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
  { value: "ON_ORDER", label: "On order" },
  { value: "DELAYED", label: "Delayed" },
  { value: "UNAVAILABLE", label: "Unavailable" },
  { value: "NOT_REQUIRED", label: "Not required" },
];

export const FILTER_STATE_OPTIONS: {
  value: "ALL" | Exclude<AlertState, "NOT_REQUIRED">;
  label: string;
}[] = [
  { value: "ALL", label: "All statuses" },
  { value: "NEW", label: "New" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
  { value: "ON_ORDER", label: "On order" },
  { value: "DELAYED", label: "Delayed" },
  { value: "UNAVAILABLE", label: "Unavailable" },
];

export function stateBadgeKind(s: AlertState): "neutral" | "warn" | "critical" {
  if (s === "NOT_REQUIRED") return "neutral";
  if (s === "ON_ORDER") return "neutral";
  if (s === "ACKNOWLEDGED") return "neutral";
  if (s === "UNAVAILABLE") return "critical";
  if (s === "DELAYED") return "warn";
  return "warn";
}

export function statePriority(s: AlertState): number {
  // Lower = higher priority
  // Suggested order: NEW, UNAVAILABLE, DELAYED, ON_ORDER, ACKNOWLEDGED
  if (s === "NEW") return 0;
  if (s === "UNAVAILABLE") return 1;
  if (s === "DELAYED") return 2;
  if (s === "ON_ORDER") return 3;
  if (s === "ACKNOWLEDGED") return 4;
  return 99;
}

export function getCategoryOptions(materials: Material[]) {
  const s = new Set<string>();
  for (const m of materials as any[]) {
    const c = String(m.category_code ?? "").trim();
    if (c) s.add(c);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

export function getTypeOptions(materials: Material[]) {
  const s = new Set<string>();
  for (const m of materials as any[]) {
    const t = String(m.type_code ?? "").trim();
    if (t) s.add(t);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}
