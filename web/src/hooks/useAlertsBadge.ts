import { useEffect, useMemo, useState } from "react";
import type { LotBalance, Material } from "../types";

// --- Alerts: localStorage-driven suppression (NOT_REQUIRED) -----------------
type AlertState =
  | "NEW"
  | "ACKNOWLEDGED"
  | "ON_ORDER"
  | "DELAYED"
  | "UNAVAILABLE"
  | "NOT_REQUIRED";

type AlertAction = {
  state: AlertState;
  eta_text?: string;
  updated_at?: string;
  last_seen_available_qty?: number;
};

export const ALERT_STORAGE_KEY = "sc_alert_actions_v1";

function safeNum(n: any): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : 0;
}

function loadAlertActions(): Record<string, AlertAction> {
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

export function keyLowStock(materialCode: string) {
  return `LOW_STOCK::${materialCode}`;
}

export function keyLowExpiry(materialCode: string, lotNumber: string) {
  return `LOW_EXPIRY::${materialCode}::${lotNumber}`;
}

/**
 * Provides the sidebar badge counts for Low Stock + Low Expiry.
 *
 * Behaviour matches the previous App.tsx logic, including:
 * - excludes suppressed alerts where action.state === "NOT_REQUIRED"
 * - listens to the custom window event "sc_alert_actions_changed" plus the
 *   native "storage" event for cross-tab updates.
 */
export function useAlertsBadge(materials: Material[], lotBalances: LotBalance[]) {
  const [alertsTick, setAlertsTick] = useState(0);

  useEffect(() => {
    const bump = () => setAlertsTick((x) => x + 1);

    window.addEventListener("sc_alert_actions_changed", bump as any);

    const onStorage = (e: StorageEvent) => {
      if (e.key === ALERT_STORAGE_KEY) bump();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("sc_alert_actions_changed", bump as any);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const alertsCounts = useMemo(() => {
    void alertsTick;

    const actions = loadAlertActions();

    const suppressed = new Set<string>();
    for (const [k, v] of Object.entries(actions)) {
      if (v?.state === "NOT_REQUIRED") suppressed.add(k);
    }

    // Available qty by material (sum of AVAILABLE segments)
    const availByMat = new Map<string, number>();
    for (const r of lotBalances as any[]) {
      if (String(r.status).toUpperCase() !== "AVAILABLE") continue;

      const code = String(r.material_code ?? "");
      const bal = safeNum(r.balance_qty ?? 0);
      availByMat.set(code, (availByMat.get(code) ?? 0) + bal);
    }

    // Low stock flagged materials (excluding suppressed)
    let lowStock = 0;
    for (const m of materials as any[]) {
      const thr = m.low_stock_threshold_qty;
      if (thr === null || thr === undefined) continue;

      const thrNum = safeNum(thr);
      const avail = availByMat.get(String(m.material_code)) ?? 0;

      if (avail <= thrNum) {
        const k = keyLowStock(String(m.material_code));
        if (!suppressed.has(k)) lowStock += 1;
      }
    }

    // Low expiry flagged lots (excluding suppressed)
    let lowExpiry = 0;
    const matByCode = new Map<string, any>();
    for (const m of materials as any[]) matByCode.set(String(m.material_code), m);

    for (const r of lotBalances as any[]) {
      if (String(r.status).toUpperCase() !== "AVAILABLE") continue;

      const bal = safeNum(r.balance_qty ?? 0);
      if (bal <= 0) continue;

      if (!r.expiry_date) continue;

      const mat = matByCode.get(String(r.material_code));
      const alertDays = mat?.expiry_alert_days;
      if (alertDays === null || alertDays === undefined) continue;

      const alertNum = safeNum(alertDays);

      const dte = r.days_to_expiry;
      if (dte === null || dte === undefined) continue;

      const dteNum = safeNum(dte);
      if (dteNum <= alertNum) {
        const k = keyLowExpiry(String(r.material_code), String(r.lot_number));
        if (!suppressed.has(k)) lowExpiry += 1;
      }
    }

    return { lowStock, lowExpiry, total: lowStock + lowExpiry };
  }, [alertsTick, materials, lotBalances]);

  return { alertsCounts };
}
