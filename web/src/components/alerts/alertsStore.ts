// web/src/components/alerts/alertsStore.ts
import type { AlertAction, ParsedKey } from "./alertsTypes";


export const ALERT_STORAGE_KEY = "sc_alert_actions_v1";

export function nowIso() {
  return new Date().toISOString();
}

export function safeNum(n: any): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : 0;
}

export function loadActions(): Record<string, AlertAction> {
  try {
    const raw = localStorage.getItem(ALERT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, AlertAction>;
  } catch {
    return {};
  }
}

export function saveActions(map: Record<string, AlertAction>) {
  localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(map));
  try {
    window.dispatchEvent(new CustomEvent("sc_alert_actions_changed"));
  } catch {
    // ignore
  }
}

export function keyLowStock(materialCode: string) {
  return `LOW_STOCK::${materialCode}`;
}
export function keyLowExpiry(materialCode: string, lotNumber: string) {
  return `LOW_EXPIRY::${materialCode}::${lotNumber}`;
}

export function parseKey(k: string): ParsedKey {
  const parts = k.split("::");
  if (parts[0] === "LOW_STOCK") return { type: "LOW_STOCK", material: parts[1] ?? "" };
  if (parts[0] === "LOW_EXPIRY")
    return { type: "LOW_EXPIRY", material: parts[1] ?? "", lot: parts[2] ?? "" };
  return { type: "LOW_STOCK", material: k };
}

/**
 * Compute "Days to AQ" (Days until auto-quarantine threshold is reached).
 *
 * Priority:
 * 1) If backend provides r.days_to_quarantine, use it.
 * 2) Else derive: days_to_expiry - expiry_threshold_days (if both exist).
 *
 * Clamp to >= 0 to avoid confusing negative values.
 */
export function computeDaysToAQ(row: any): number | null {
  const direct =
    row?.days_to_quarantine ??
    row?.days_to_aq ??
    row?.days_to_auto_quarantine ??
    row?.days_until_auto_quarantine ??
    null;

  if (direct !== null && direct !== undefined) {
    const v = safeNum(direct);
    return v < 0 ? 0 : v;
  }

  const dte = row?.days_to_expiry ?? null;
  const thresholdDays = row?.expiry_threshold_days ?? row?.expiry_threshold ?? null;

  if (dte === null || dte === undefined) return null;
  if (thresholdDays === null || thresholdDays === undefined) return null;

  const v = safeNum(dte) - safeNum(thresholdDays);
  return v < 0 ? 0 : v;
}
