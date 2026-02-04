// src/components/dashboard/DashboardView.tsx

import React, { useEffect, useMemo, useState } from "react";
import type { DashboardSummary, LotBalance, Material } from "../../types";
import { apiFetch, fetchAlertActions } from "../../utils/api";
import { formatGBP } from "../../utils/format";

import type { AlertAction, AlertState } from "../alerts/alertsTypes";
import {
  keyLowExpiry,
  keyLowStock,
  loadActions,
  saveActions,
  safeNum,
} from "../alerts/alertsStore";

type DashboardViewProps = {
  materials: Material[];
  lotBalances: LotBalance[];
  onGoToAlerts: () => void;
};

type DashAlertRow =
  | {
      kind: "LOW_STOCK";
      key: string;
      material_code: string;
      name: string;
      available_qty: number;
      threshold_qty: number;
      uom: string;
      severity: "warn" | "critical";
      action: AlertAction;
    }
  | {
      kind: "LOW_EXPIRY";
      key: string;
      material_code: string;
      name: string;
      lot_number: string;
      days_to_expiry: number;
      qty: number;
      uom: string;
      severity: "warn" | "critical";
      action: AlertAction;
    };

type LatestBatchRow = {
  product_batch_no: string;
  es_product_code: string;
  manufactured_at: string; // ISO string
  last_issue_at: string; // ISO string
};

function fmtTs(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
  const tt = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${dd}  ${tt}`;
}

const DashboardView: React.FC<DashboardViewProps> = ({
  materials,
  lotBalances,
  onGoToAlerts,
}) => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  const [actionsLoaded, setActionsLoaded] = useState(false);
  const [actions, setActions] = useState<Record<string, AlertAction>>({});

  const [latestBatches, setLatestBatches] = useState<LatestBatchRow[]>([]);
  const [latestErr, setLatestErr] = useState<string | null>(null);

  // --- Load dashboard summary ------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setSummaryErr(null);
        const res = await apiFetch("/summary/dashboard");
        if (!res.ok) throw new Error(`Failed to load dashboard summary (${res.status})`);
        const data = (await res.json()) as DashboardSummary;
        if (!cancelled) setSummary(data);
      } catch (e: any) {
        if (!cancelled) setSummaryErr(e?.message ?? "Failed to load dashboard summary");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Load alert actions (for NEW status) -----------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const local = loadActions();
        const serverRows = await fetchAlertActions();
        const merged: Record<string, AlertAction> = { ...local };

        for (const r of serverRows as any[]) {
          const k = String(r.alert_key ?? "");
          if (!k) continue;
          merged[k] = {
            state: (r.state ?? "NEW") as AlertState,
            eta_text: r.eta_text ?? undefined,
            updated_at: r.updated_at ?? undefined,
            last_seen_available_qty: r.last_seen_available_qty ?? undefined,
          };
        }

        if (!cancelled) {
          setActions(merged);
          saveActions(merged);
          setActionsLoaded(true);
        }
      } catch {
        const local = loadActions();
        if (!cancelled) {
          setActions(local);
          setActionsLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Load latest manufactured batches --------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLatestErr(null);
        const res = await apiFetch("/analytics/latest-batches?limit=8");
        if (!res.ok) throw new Error(`Failed to load latest batches (${res.status})`);
        const payload = (await res.json()) as any;
        const rows = (payload?.rows ?? []) as LatestBatchRow[];
        if (!cancelled) setLatestBatches(rows);
      } catch (e: any) {
        if (!cancelled) setLatestErr(e?.message ?? "Failed to load latest batches");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Derived maps used by alert computations -------------------------------
  const materialByCode = useMemo(() => {
    const m = new Map<string, Material>();
    for (const mat of materials) m.set(String(mat.material_code), mat);
    return m;
  }, [materials]);

  const availableQtyByMaterial = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of lotBalances as any[]) {
      if (String((r as any).status).toUpperCase() !== "AVAILABLE") continue;
      const code = String((r as any).material_code);
      m.set(code, (m.get(code) ?? 0) + safeNum((r as any).balance_qty));
    }
    return m;
  }, [lotBalances]);

  // --- Build NEW alerts list (same logic, but cleaner UI later) ---------------
  const newAlerts = useMemo((): DashAlertRow[] => {
    if (!actionsLoaded) return [];
    const out: DashAlertRow[] = [];

    // LOW STOCK (unique per material)
    for (const mat of materials as any[]) {
      const thrRaw = mat.low_stock_threshold_qty;
      if (thrRaw === null || thrRaw === undefined) continue;

      const code = String(mat.material_code);
      const name = String(mat.name ?? "");
      const uom = String(mat.base_uom_code ?? "");
      const avail = availableQtyByMaterial.get(code) ?? 0;
      const thr = safeNum(thrRaw);

      if (avail > thr) continue;

      const key = keyLowStock(code);
      const action = actions[key] ?? { state: "NEW" as AlertState };
      if (action.state === "NOT_REQUIRED") continue;
      if (action.state !== "NEW") continue;

      const severity: "warn" | "critical" =
        avail <= Math.max(0, thr * 0.5) ? "critical" : "warn";

      out.push({
        kind: "LOW_STOCK",
        key,
        material_code: code,
        name,
        available_qty: avail,
        threshold_qty: thr,
        uom,
        severity,
        action,
      });
    }

    // LOW EXPIRY (per lot)
    for (const r of lotBalances as any[]) {
      if (String(r.status).toUpperCase() !== "AVAILABLE") continue;
      const qty = safeNum(r.balance_qty);
      if (qty <= 0) continue;
      if (!r.expiry_date) continue;

      const code = String(r.material_code);
      const lot = String(r.lot_number);
      const mat: any = materialByCode.get(code);
      if (!mat) continue;

      const alertDays = mat.expiry_alert_days;
      if (alertDays === null || alertDays === undefined) continue;

      const dte = r.days_to_expiry;
      if (dte === null || dte === undefined) continue;
      if (safeNum(dte) > safeNum(alertDays)) continue;

      const key = keyLowExpiry(code, lot);
      const action = actions[key] ?? { state: "NEW" as AlertState };
      if (action.state === "NOT_REQUIRED") continue;
      if (action.state !== "NEW") continue;

      const severity: "warn" | "critical" = safeNum(dte) <= 7 ? "critical" : "warn";

      out.push({
        kind: "LOW_EXPIRY",
        key,
        material_code: code,
        name: String(mat.name ?? ""),
        lot_number: lot,
        days_to_expiry: safeNum(dte),
        qty,
        uom: String(mat.base_uom_code ?? ""),
        severity,
        action,
      });
    }

    // Sort: critical first, then soonest expiry, then lowest stock
    out.sort((a, b) => {
      const sevA = a.severity === "critical" ? 0 : 1;
      const sevB = b.severity === "critical" ? 0 : 1;
      if (sevA !== sevB) return sevA - sevB;

      const aDte = a.kind === "LOW_EXPIRY" ? a.days_to_expiry : 999999;
      const bDte = b.kind === "LOW_EXPIRY" ? b.days_to_expiry : 999999;
      if (aDte !== bDte) return aDte - bDte;

      const aAvail = a.kind === "LOW_STOCK" ? a.available_qty : 999999;
      const bAvail = b.kind === "LOW_STOCK" ? b.available_qty : 999999;
      if (aAvail !== bAvail) return aAvail - bAvail;

      return String(a.material_code).localeCompare(String(b.material_code));
    });

    return out.slice(0, 6);
  }, [actions, actionsLoaded, availableQtyByMaterial, lotBalances, materialByCode, materials]);

  // --- Metric values ---------------------------------------------------------
  const m_total_materials = summary?.total_materials ?? materials.length;
  const m_low_expiry = summary?.materials_low_expiry ?? 0;
  const m_low_stock = summary?.materials_low_stock ?? 0;
  const m_batches_today = summary?.batches_manufactured_today ?? 0;
  const m_receipts_today = summary?.receipts_today ?? 0;
  const m_total_value = summary?.total_material_value ?? 0;

  return (
    <section className="content">
      <div className="grid-top">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Main Dashboard</div>
              <div className="card-subtitle">Live snapshot</div>
              {summaryErr && (
                <div className="hint" style={{ marginTop: 6 }}>
                  ⚠ {summaryErr}
                </div>
              )}
            </div>
          </div>

          {/* METRICS */}
          <div className="metrics-row">
            <div className="metric-card accent-1">
              <div className="metric-label">Total materials</div>
              <div className="metric-value">{m_total_materials}</div>
              <div className="mini-spark">Σ</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Materials in low expiry alerts</div>
              <div className="metric-value">{m_low_expiry}</div>
              <div className="mini-spark">⏳</div>
            </div>

            <div className="metric-card accent-2">
              <div className="metric-label">Materials in low stock alerts</div>
              <div className="metric-value">{m_low_stock}</div>
              <div className="mini-spark">📉</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Batches manufactured today</div>
              <div className="metric-value">{m_batches_today}</div>
              <div className="mini-spark">🏷️</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Receipts today</div>
              <div className="metric-value">{m_receipts_today}</div>
              <div className="mini-spark">📥</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Total material value</div>
              <div className="metric-value">{formatGBP(m_total_value)}</div>
              <div className="mini-spark">£</div>
            </div>
          </div>

          {/* ✅ TWO WIDGETS SIDE-BY-SIDE */}
          <div className="dash-widgets">
            {/* LEFT: NEW Alerts */}
            <div className="dash-widget">
              <div className="dash-widget-header">
                <div className="dash-widget-title">New low stock &amp; expiry alerts</div>
                <button className="btn btn-ghost" type="button" onClick={onGoToAlerts}>
                  See all alerts →
                </button>
              </div>

              {newAlerts.length === 0 ? (
                <div className="hint" style={{ padding: "10px 2px" }}>
                  No NEW alerts.
                </div>
              ) : (
                <ul className="dash-alert-list">
                  {newAlerts.map((a) => (
                    <li key={a.key} className="dash-alert-item">
                      <div className="dash-alert-left">
                        <div className="dash-alert-name">
                          <span className={a.severity === "critical" ? "dot-danger" : "dot-warning"} />
                          {a.name}
                        </div>
                        <div className="dash-alert-meta">{a.material_code}</div>
                      </div>

                      {a.kind === "LOW_EXPIRY" ? (
                        <>
                          <div className="dash-alert-mid">
                            <div className="dash-k">Lot</div>
                            <div className="dash-v">{a.lot_number}</div>
                          </div>
                          <div className="dash-alert-right">
                            <div className="dash-k">Expires in</div>
                            <div className="dash-v">
                              {a.days_to_expiry}d{" "}
                              <span className={a.severity === "critical" ? "dash-badge danger" : "dash-badge warn"}>
                                {a.severity === "critical" ? "Critical" : "Soon"}
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="dash-alert-mid">
                            <div className="dash-k">Threshold</div>
                            <div className="dash-v">
                              {a.threshold_qty} {a.uom}
                            </div>
                          </div>
                          <div className="dash-alert-right">
                            <div className="dash-k">Available</div>
                            <div className="dash-v">
                              {a.available_qty} {a.uom}{" "}
                              <span className={a.severity === "critical" ? "dash-badge danger" : "dash-badge warn"}>
                                {a.severity === "critical" ? "Critical" : "Low"}
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* RIGHT: Latest manufactured batches */}
            <div className="dash-widget">
              <div className="dash-widget-header">
                <div className="dash-widget-title">Latest manufactured batches</div>
                <div className="hint" style={{ margin: 0 }}>
                  newest first
                </div>
              </div>

              {latestErr && (
                <div className="hint" style={{ marginTop: 8 }}>
                  ⚠ {latestErr}
                </div>
              )}

              {latestBatches.length === 0 ? (
                <div className="hint" style={{ padding: "10px 2px" }}>
                  No batch activity found.
                </div>
              ) : (
                <ul className="dash-batch-list">
                  {latestBatches.map((r) => (
                    <li key={`${r.product_batch_no}-${r.es_product_code}`} className="dash-batch-item">
                      <div className="dash-batch-left">
                        <div className="dash-batch-bn">{r.product_batch_no}</div>
                        <div className="dash-batch-meta">{r.es_product_code}</div>
                      </div>
                      <div className="dash-batch-right">
                        <div className="dash-k">Manufactured</div>
                        <div className="dash-v">{fmtTs(r.manufactured_at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
};

export default DashboardView;
