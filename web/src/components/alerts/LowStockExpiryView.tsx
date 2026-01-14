import React, { useEffect, useMemo, useState } from "react";
import type { LotBalance, Material } from "../../types";

type Props = {
  materials: Material[];
  lotBalances: LotBalance[];
};

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

const ALERT_STORAGE_KEY = "sc_alert_actions_v1";

function nowIso() {
  return new Date().toISOString();
}

function safeNum(n: any): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : 0;
}

function loadActions(): Record<string, AlertAction> {
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

function saveActions(map: Record<string, AlertAction>) {
  localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(map));
  try {
    window.dispatchEvent(new CustomEvent("sc_alert_actions_changed"));
  } catch {
    // ignore
  }
}

function keyLowStock(materialCode: string) {
  return `LOW_STOCK::${materialCode}`;
}
function keyLowExpiry(materialCode: string, lotNumber: string) {
  return `LOW_EXPIRY::${materialCode}::${lotNumber}`;
}

type AlertType = "LOW_STOCK" | "LOW_EXPIRY";

type ParsedKey = {
  type: AlertType;
  material: string;
  lot?: string;
};

function parseKey(k: string): ParsedKey {
  const parts = k.split("::");
  if (parts[0] === "LOW_STOCK") return { type: "LOW_STOCK", material: parts[1] ?? "" };
  if (parts[0] === "LOW_EXPIRY")
    return { type: "LOW_EXPIRY", material: parts[1] ?? "", lot: parts[2] ?? "" };
  return { type: "LOW_STOCK", material: k };
}

type LowStockRow = {
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

type LowExpiryRow = {
  key: string;
  material_code: string;
  name: string;
  lot_number: string;
  expiry_date: string;
  days_to_expiry: number;
  alert_days: number;
  days_to_quarantine: number | null;
  qty: number;
  severity: "warn" | "critical";
  action: AlertAction;
};

const STATE_OPTIONS: { value: AlertState; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
  { value: "ON_ORDER", label: "On order" },
  { value: "DELAYED", label: "Delayed" },
  { value: "UNAVAILABLE", label: "Unavailable" },
  { value: "NOT_REQUIRED", label: "Not required" },
];

function stateBadgeKind(s: AlertState): "neutral" | "warn" | "critical" {
  if (s === "NOT_REQUIRED") return "neutral";
  if (s === "ON_ORDER") return "neutral";
  if (s === "ACKNOWLEDGED") return "neutral";
  if (s === "UNAVAILABLE") return "critical";
  if (s === "DELAYED") return "warn";
  return "warn";
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
function computeDaysToAQ(row: any): number | null {
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

const LowStockExpiryView: React.FC<Props> = ({ materials, lotBalances }) => {
  const [q, setQ] = useState("");
  const [actionsLoaded, setActionsLoaded] = useState(false);
  const [actions, setActions] = useState<Record<string, AlertAction>>({});
  const [showSuppressed, setShowSuppressed] = useState(false);

  useEffect(() => {
    const map = loadActions();
    setActions(map);
    setActionsLoaded(true);
    try {
      window.dispatchEvent(new CustomEvent("sc_alert_actions_changed"));
    } catch {
      // ignore
    }
  }, []);

  const upsertAction = (key: string, patch: Partial<AlertAction>) => {
    setActions((prev) => {
      const cur = prev[key] ?? { state: "NEW" as AlertState };
      const next: AlertAction = {
        ...cur,
        ...patch,
        updated_at: nowIso(),
      };
      const merged = { ...prev, [key]: next };
      saveActions(merged);
      return merged;
    });
  };

  const removeAction = (key: string) => {
    setActions((prev) => {
      const next = { ...prev };
      delete next[key];
      saveActions(next);
      return next;
    });
  };

  const availableQtyByMaterial = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of lotBalances as any[]) {
      if (String(r.status).toUpperCase() !== "AVAILABLE") continue;
      const code = String(r.material_code);
      m.set(code, (m.get(code) ?? 0) + safeNum((r as any).balance_qty));
    }
    return m;
  }, [lotBalances]);

  const materialByCode = useMemo(() => {
    const m = new Map<string, Material>();
    for (const mat of materials) m.set(String(mat.material_code), mat);
    return m;
  }, [materials]);

  const lowStockRows = useMemo(() => {
    const out: LowStockRow[] = [];
    const query = q.trim().toLowerCase();

    for (const mat of materials as any[]) {
      const thrRaw = (mat as any).low_stock_threshold_qty;
      if (thrRaw === null || thrRaw === undefined) continue;

      const code = String((mat as any).material_code);
      const name = String((mat as any).name ?? "");
      const category = String((mat as any).category_code ?? "");
      const type = String((mat as any).type_code ?? "");
      const uom = String((mat as any).base_uom_code ?? "");
      const avail = availableQtyByMaterial.get(code) ?? 0;
      const thr = safeNum(thrRaw);

      if (avail > thr) continue;

      const key = keyLowStock(code);
      const action = actions[key] ?? { state: "NEW" as AlertState };

      // suppressed
      if (action.state === "NOT_REQUIRED") continue;

      if (query) {
        const hay = `${code} ${name} ${category} ${type}`.toLowerCase();
        if (!hay.includes(query)) continue;
      }

      const sev: "warn" | "critical" =
        thr > 0 && avail <= thr * 0.5 ? "critical" : "warn";

      out.push({
        key,
        material_code: code,
        name,
        category_code: category,
        type_code: type,
        base_uom_code: uom,
        available_qty: Number(avail.toFixed(6)),
        threshold_qty: Number(thr.toFixed(6)),
        severity: sev,
        action,
      });
    }

    out.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
      return a.material_code.localeCompare(b.material_code);
    });

    return out;
  }, [materials, availableQtyByMaterial, actions, q]);

  const lowExpiryRows = useMemo(() => {
    const out: LowExpiryRow[] = [];
    const query = q.trim().toLowerCase();

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

      // suppressed
      if (action.state === "NOT_REQUIRED") continue;

      const name = String(mat.name ?? "");
      const exp = String(r.expiry_date);
      const daysToExpiry = safeNum(dte);

      // ✅ Days to AQ (auto-quarantine) restored from older script logic
      const daysToAQ = computeDaysToAQ(r);

      if (query) {
        const hay = `${code} ${name} ${lot}`.toLowerCase();
        if (!hay.includes(query)) continue;
      }

      const sev: "warn" | "critical" =
        daysToExpiry <= 7 ? "critical" : "warn";

      out.push({
        key,
        material_code: code,
        name,
        lot_number: lot,
        expiry_date: exp,
        days_to_expiry: daysToExpiry,
        alert_days: safeNum(alertDays),
        days_to_quarantine: daysToAQ,
        qty: Number(qty.toFixed(6)),
        severity: sev,
        action,
      });
    }

    out.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
      if (a.days_to_expiry !== b.days_to_expiry) return a.days_to_expiry - b.days_to_expiry;
      return a.material_code.localeCompare(b.material_code);
    });

    return out;
  }, [lotBalances, materialByCode, actions, q]);

  // keep action map "fresh" so NOT_REQUIRED is sticky even when balances fluctuate
  useEffect(() => {
    if (!actionsLoaded) return;

    setActions((prev) => {
      let changed = false;
      const next = { ...prev };

      // low stock: update last_seen_available_qty
      for (const mat of materials as any[]) {
        const thrRaw = mat.low_stock_threshold_qty;
        if (thrRaw === null || thrRaw === undefined) continue;
        const code = String(mat.material_code);
        const key = keyLowStock(code);

        const act = next[key];
        if (!act) continue;

        const avail = availableQtyByMaterial.get(code) ?? 0;

        if (act.last_seen_available_qty !== avail) {
          next[key] = { ...act, last_seen_available_qty: avail };
          changed = true;
        }
      }

      if (changed) saveActions(next);
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, availableQtyByMaterial, actionsLoaded]);

  const badge = (text: string, kind: "neutral" | "warn" | "critical") => {
    const bg =
      kind === "critical"
        ? "rgba(239, 68, 68, 0.18)"
        : kind === "warn"
        ? "rgba(245, 158, 11, 0.18)"
        : "rgba(99, 102, 241, 0.18)";
    const border =
      kind === "critical"
        ? "rgba(239, 68, 68, 0.35)"
        : kind === "warn"
        ? "rgba(245, 158, 11, 0.35)"
        : "rgba(99, 102, 241, 0.35)";
    const color =
      kind === "critical"
        ? "rgba(252, 165, 165, 1)"
        : kind === "warn"
        ? "rgba(253, 186, 116, 1)"
        : "rgba(199, 210, 254, 1)";
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 999,
          background: bg,
          border: `1px solid ${border}`,
          color,
          fontSize: 12,
          fontWeight: 600,
          lineHeight: "16px",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </span>
    );
  };

  const sectionHeader = (
    title: string,
    count: number,
    kind: "neutral" | "warn" | "critical"
  ) => (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      </div>
      <div>{badge(`${count} flagged`, kind)}</div>
    </div>
  );

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.02em",
    color: "rgba(226, 232, 240, 0.9)",
    padding: "12px 14px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: "rgba(15, 23, 42, 0.92)",
    backdropFilter: "blur(6px)",
  };

  const tdStyle: React.CSSProperties = {
    fontSize: 13,
    padding: "12px 14px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.08)",
    verticalAlign: "middle",
  };

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
  };

  const renderMgmtCell = (k: string, act: AlertAction) => {
    const onChangeState = (nextState: AlertState) => {
      if (nextState === "NOT_REQUIRED" && act.state !== "NOT_REQUIRED") {
        const ok = window.confirm(
          "Do you really want to set this alert to 'Not required'?\n\nThis will remove it from the alert list until it is next restocked."
        );
        if (!ok) return;
      }
      upsertAction(k, { state: nextState });
    };

    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <select
          className="input"
          style={{ height: 34, width: 160, fontSize: 13 }}
          value={act.state}
          onChange={(e) => onChangeState(e.target.value as AlertState)}
        >
          {STATE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <input
          className="input"
          style={{ height: 34, width: 220, fontSize: 13 }}
          placeholder="ETA / due date (text)…"
          value={act.eta_text ?? ""}
          onChange={(e) => upsertAction(k, { eta_text: e.target.value })}
        />

        {badge(
          STATE_OPTIONS.find((o) => o.value === act.state)?.label ?? act.state,
          stateBadgeKind(act.state)
        )}
      </div>
    );
  };

  const suppressed = useMemo(() => {
    if (!actionsLoaded) return [];
    const out: { key: string; info: ParsedKey; action: AlertAction }[] = [];
    for (const [k, v] of Object.entries(actions)) {
      if (v?.state !== "NOT_REQUIRED") continue;
      out.push({ key: k, info: parseKey(k), action: v });
    }
    out.sort((a, b) => {
      if (a.info.type !== b.info.type)
        return a.info.type.localeCompare(b.info.type);
      if (a.info.material !== b.info.material)
        return a.info.material.localeCompare(b.info.material);
      return (a.info.lot ?? "").localeCompare(b.info.lot ?? "");
    });
    return out;
  }, [actions, actionsLoaded]);

  const totalFlagged = lowStockRows.length + lowExpiryRows.length;

  if (!actionsLoaded) {
    return (
      <div className="page">
        <div className="page-header" style={{ gap: 10 }}>
          <div />
          <div className="muted" style={{ fontSize: 13 }}>
            Loading alerts…
          </div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-header">
            <div style={{ fontSize: 16, fontWeight: 700 }}>Low Stock</div>
          </div>
          <div style={{ padding: 16 }} className="muted">
            Preparing view…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header" style={{ gap: 10 }}>
        <div />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowSuppressed(true)}
            disabled={suppressed.length === 0}
          >
            Manage suppressed ({suppressed.length})
          </button>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search material / lot..."
            className="input"
            style={{ width: 320, height: 36, fontSize: 13 }}
          />

          {badge(`Total: ${totalFlagged}`, totalFlagged > 0 ? "warn" : "neutral")}
        </div>
      </div>

      {/* LOW STOCK */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-header" style={{ paddingBottom: 0 }}>
          {sectionHeader(
            "Low Stock",
            lowStockRows.length,
            lowStockRows.length > 0 ? "warn" : "neutral"
          )}
        </div>

        <div
          className="table-wrap"
          style={{
            paddingTop: 6,
            maxHeight: 360,
            overflow: "auto",
            borderRadius: 12,
          }}
        >
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: "14%" }}>Material</th>
                <th style={{ ...thStyle, width: "22%" }}>Name</th>
                <th style={{ ...thStyle, width: "14%" }}>Category / Type</th>
                <th style={{ ...thStyle, textAlign: "right", width: "9%" }}>
                  Available
                </th>
                <th style={{ ...thStyle, textAlign: "right", width: "9%" }}>
                  Threshold
                </th>
                <th style={{ ...thStyle, width: "8%" }}>UOM</th>
                <th style={{ ...thStyle, width: "24%" }}>Alert management</th>
              </tr>
            </thead>
            <tbody>
              {lowStockRows.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={7} className="muted">
                    No low stock alerts triggered.
                  </td>
                </tr>
              ) : (
                lowStockRows.map((r) => (
                  <tr
                    key={r.key}
                    style={{
                      background:
                        r.severity === "critical"
                          ? "rgba(239, 68, 68, 0.06)"
                          : "transparent",
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 700 }}>
                      {r.material_code}
                    </td>
                    <td style={tdStyle}>{r.name}</td>
                    <td style={tdStyle} className="muted">
                      {r.category_code} / {r.type_code}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.available_qty}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.threshold_qty}
                    </td>
                    <td style={tdStyle}>{r.base_uom_code}</td>
                    <td style={tdStyle}>{renderMgmtCell(r.key, r.action)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* LOW EXPIRY */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-header" style={{ paddingBottom: 0 }}>
          {sectionHeader(
            "Low Expiry",
            lowExpiryRows.length,
            lowExpiryRows.length > 0 ? "warn" : "neutral"
          )}
        </div>

        <div
          className="table-wrap"
          style={{
            paddingTop: 6,
            maxHeight: 420,
            overflow: "auto",
            borderRadius: 12,
          }}
        >
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: "14%" }}>Material</th>
                <th style={{ ...thStyle, width: "22%" }}>Name</th>
                <th style={{ ...thStyle, width: "14%" }}>Lot</th>
                <th style={{ ...thStyle, width: "14%" }}>Expiry</th>
                <th style={{ ...thStyle, textAlign: "right", width: "8%" }}>
                  Days to expiry
                </th>

                {/* ✅ AQ label + tooltip */}
                <th
                  style={{
                    ...thStyle,
                    textAlign: "right",
                    width: "8%",
                    whiteSpace: "normal",
                    lineHeight: "14px",
                  }}
                  title="Days until auto quarantine"
                >
                  Days to AQ
                </th>

                <th style={{ ...thStyle, textAlign: "right", width: "8%" }}>
                  Alert days
                </th>
                <th style={{ ...thStyle, textAlign: "right", width: "10%" }}>
                  Qty
                </th>
                <th style={{ ...thStyle, width: "24%" }}>Alert management</th>
              </tr>
            </thead>
            <tbody>
              {lowExpiryRows.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={9} className="muted">
                    No low expiry alerts triggered.
                  </td>
                </tr>
              ) : (
                lowExpiryRows.map((r) => (
                  <tr
                    key={r.key}
                    style={{
                      background:
                        r.severity === "critical"
                          ? "rgba(239, 68, 68, 0.06)"
                          : "transparent",
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 700 }}>
                      {r.material_code}
                    </td>
                    <td style={tdStyle}>{r.name}</td>
                    <td style={tdStyle}>{r.lot_number}</td>
                    <td style={tdStyle}>{r.expiry_date}</td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.days_to_expiry}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.days_to_quarantine === null ? "—" : r.days_to_quarantine}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.alert_days}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.qty}
                    </td>
                    <td style={tdStyle}>{renderMgmtCell(r.key, r.action)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SUPPRESSED MODAL */}
      {showSuppressed && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 820 }}>
            <div className="modal-header">
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Suppressed alerts</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  Alerts marked as “Not required” won’t appear until restocked / re-triggered.
                </div>
              </div>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setShowSuppressed(false)}
              >
                Close
              </button>
            </div>

            <div style={{ padding: 14 }}>
              {suppressed.length === 0 ? (
                <div className="muted">No suppressed alerts.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle }}>Type</th>
                      <th style={{ ...thStyle }}>Material</th>
                      <th style={{ ...thStyle }}>Lot</th>
                      <th style={{ ...thStyle }}>State</th>
                      <th style={{ ...thStyle }}>ETA</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppressed.map((s) => (
                      <tr key={s.key}>
                        <td style={tdStyle}>
                          {s.info.type === "LOW_STOCK" ? "Low Stock" : "Low Expiry"}
                        </td>
                        <td style={tdStyle}>{s.info.material}</td>
                        <td style={tdStyle}>{s.info.lot ?? "—"}</td>
                        <td style={tdStyle}>{s.action.state}</td>
                        <td style={tdStyle}>{s.action.eta_text ?? "—"}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => upsertAction(s.key, { state: "NEW" })}
                          >
                            Undo
                          </button>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => removeAction(s.key)}
                            style={{ marginLeft: 8 }}
                          >
                            Delete entry
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-primary" type="button" onClick={() => setShowSuppressed(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LowStockExpiryView;
