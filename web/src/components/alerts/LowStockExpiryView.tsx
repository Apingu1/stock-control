import React, { useMemo, useState } from "react";
import type { LotBalance, Material } from "../../types";

type Props = {
  materials: Material[];
  lotBalances: LotBalance[];
};

function safeNum(n: any): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : 0;
}

// Local formatter (DD-MM-YYYY) to avoid relying on utils/format exports
function formatDateDMY(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

const LowStockExpiryView: React.FC<Props> = ({ materials, lotBalances }) => {
  const [q, setQ] = useState("");

  const qNorm = q.trim().toLowerCase();

  const materialByCode = useMemo(() => {
    const m = new Map<string, Material>();
    for (const mat of materials) m.set(mat.material_code, mat);
    return m;
  }, [materials]);

  const availableQtyByMaterial = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of lotBalances) {
      if (String((row as any).status).toUpperCase() !== "AVAILABLE") continue;
      const key = (row as any).material_code;
      m.set(key, (m.get(key) ?? 0) + safeNum((row as any).balance_qty));
    }
    return m;
  }, [lotBalances]);

  const lowStockRows = useMemo(() => {
    const rows = materials
      .filter(
        (m) =>
          (m as any).low_stock_threshold_qty !== null &&
          (m as any).low_stock_threshold_qty !== undefined
      )
      .map((m) => {
        const avail = availableQtyByMaterial.get(m.material_code) ?? 0;
        const thr = safeNum((m as any).low_stock_threshold_qty);
        return {
          material_code: m.material_code,
          name: m.name,
          category_code: m.category_code,
          type_code: m.type_code,
          base_uom_code: m.base_uom_code,
          available_qty: avail,
          threshold_qty: thr,
          is_trigger: avail <= thr,
          severity:
            thr <= 0
              ? "info"
              : avail <= Math.max(0, thr * 0.5)
              ? "critical"
              : "warn",
        };
      })
      .filter((r) => r.is_trigger)
      .sort((a, b) => {
        // more severe first
        const sRank = (s: string) =>
          s === "critical" ? 0 : s === "warn" ? 1 : 2;
        const ra = sRank(a.severity);
        const rb = sRank(b.severity);
        if (ra !== rb) return ra - rb;
        return a.material_code.localeCompare(b.material_code);
      });

    if (!qNorm) return rows;

    return rows.filter(
      (r) =>
        r.material_code.toLowerCase().includes(qNorm) ||
        r.name.toLowerCase().includes(qNorm)
    );
  }, [materials, availableQtyByMaterial, qNorm]);

  const lowExpiryRows = useMemo(() => {
    const rows = lotBalances
      .filter((r) => String((r as any).status).toUpperCase() === "AVAILABLE")
      .filter((r) => safeNum((r as any).balance_qty) > 0)
      .filter((r) => (r as any).expiry_date)
      .map((r) => {
        const mat = materialByCode.get((r as any).material_code);
        const alertDays = (mat as any)?.expiry_alert_days ?? null;

        const dte = (r as any).days_to_expiry ?? null;

        return {
          material_code: (r as any).material_code,
          material_name: (r as any).material_name,
          lot_number: (r as any).lot_number,
          expiry_date: (r as any).expiry_date as string,
          days_to_expiry: dte as number | null,
          alert_days: alertDays as number | null,
          qty: safeNum((r as any).balance_qty),
          uom_code: (r as any).uom_code,
          is_trigger:
            alertDays !== null &&
            alertDays !== undefined &&
            dte !== null &&
            dte !== undefined &&
            dte <= alertDays,
          severity:
            dte !== null
              ? dte <= 0
                ? "expired"
                : dte <= 7
                ? "critical"
                : "warn"
              : "warn",
        };
      })
      .filter((r) => r.is_trigger)
      .sort((a, b) => {
        const sRank = (s: string) =>
          s === "expired"
            ? 0
            : s === "critical"
            ? 1
            : s === "warn"
            ? 2
            : 3;
        const ra = sRank(a.severity);
        const rb = sRank(b.severity);
        if (ra !== rb) return ra - rb;
        const da = a.days_to_expiry ?? 999999;
        const db = b.days_to_expiry ?? 999999;
        if (da !== db) return da - db;
        return a.material_code.localeCompare(b.material_code);
      });

    if (!qNorm) return rows;

    return rows.filter(
      (r) =>
        r.material_code.toLowerCase().includes(qNorm) ||
        r.material_name.toLowerCase().includes(qNorm) ||
        r.lot_number.toLowerCase().includes(qNorm)
    );
  }, [lotBalances, materialByCode, qNorm]);

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
    hint: string,
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
        <div className="muted" style={{ fontSize: 12 }}>
          {hint}
        </div>
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

  return (
    <div className="page">
      <div className="page-header" style={{ gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.02em" }}>
            Low Stock &amp; Expiry
          </h2>
          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            Material-level alerts only. No status enforcement or auto-unquarantine in this phase.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search material / lot..."
            className="input"
            style={{
              width: 320,
              height: 36,
              fontSize: 13,
            }}
          />
          {badge(
            `Total: ${lowStockRows.length + lowExpiryRows.length}`,
            lowStockRows.length + lowExpiryRows.length > 0 ? "warn" : "neutral"
          )}
        </div>
      </div>

      {/* Low Stock */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-header" style={{ paddingBottom: 0 }}>
          {sectionHeader(
            "Low Stock",
            lowStockRows.length,
            "Triggered when AVAILABLE qty ≤ material threshold",
            lowStockRows.length > 0 ? "warn" : "neutral"
          )}
        </div>

        <div className="table-wrap" style={{ paddingTop: 6 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: "18%" }}>Material</th>
                <th style={{ ...thStyle, width: "34%" }}>Name</th>
                <th style={{ ...thStyle, width: "18%" }}>Category / Type</th>
                <th style={{ ...thStyle, textAlign: "right", width: "10%" }}>
                  Available
                </th>
                <th style={{ ...thStyle, textAlign: "right", width: "10%" }}>
                  Threshold
                </th>
                <th style={{ ...thStyle, width: "10%" }}>UOM</th>
              </tr>
            </thead>
            <tbody>
              {lowStockRows.length === 0 ? (
                <tr>
                  <td style={{ ...tdStyle }} colSpan={6} className="muted">
                    No low stock alerts triggered.
                  </td>
                </tr>
              ) : (
                lowStockRows.map((r) => (
                  <tr
                    key={r.material_code}
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
                    <td style={{ ...tdStyle }} className="muted">
                      {r.category_code} / {r.type_code}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {r.available_qty}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {r.threshold_qty}
                    </td>
                    <td style={tdStyle}>{r.base_uom_code}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Low Expiry */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-header" style={{ paddingBottom: 0 }}>
          {sectionHeader(
            "Low Expiry",
            lowExpiryRows.length,
            "Triggered when any AVAILABLE lot days_to_expiry ≤ material alert days",
            lowExpiryRows.length > 0 ? "warn" : "neutral"
          )}
        </div>

        <div className="table-wrap" style={{ paddingTop: 6 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: "22%" }}>Material</th>
                <th style={{ ...thStyle, width: "14%" }}>Lot</th>
                <th style={{ ...thStyle, width: "14%" }}>Expiry</th>
                <th style={{ ...thStyle, textAlign: "right", width: "14%" }}>
                  Days to expiry
                </th>
                <th style={{ ...thStyle, textAlign: "right", width: "12%" }}>
                  Alert days
                </th>
                <th style={{ ...thStyle, textAlign: "right", width: "14%" }}>
                  Qty
                </th>
                <th style={{ ...thStyle, width: "10%" }}>UOM</th>
              </tr>
            </thead>
            <tbody>
              {lowExpiryRows.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={7} className="muted">
                    No low expiry alerts triggered.
                  </td>
                </tr>
              ) : (
                lowExpiryRows.map((r, i) => {
                  const kind =
                    r.severity === "expired" || r.severity === "critical"
                      ? "critical"
                      : "warn";
                  return (
                    <tr
                      key={`${r.material_code}__${r.lot_number}__${i}`}
                      style={{
                        background:
                          kind === "critical"
                            ? "rgba(239, 68, 68, 0.06)"
                            : "transparent",
                      }}
                    >
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700 }}>{r.material_code}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {r.material_name}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                        {r.lot_number}
                      </td>
                      <td style={tdStyle}>{formatDateDMY(r.expiry_date)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {r.days_to_expiry ?? ""}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {r.alert_days ?? ""}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {r.qty}
                      </td>
                      <td style={tdStyle}>{r.uom_code}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LowStockExpiryView;
