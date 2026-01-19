// web/src/components/alerts/LowStockPanel.tsx
import React from "react";
import type { LowStockRow, LowStockSortMode, UpsertMeta } from "./alertsTypes";
import { sectionHeader, tableStyle, tdStyle, thStyle, formatQty } from "./alertsUi";

type Props = {
  rows: LowStockRow[];
  sortMode: LowStockSortMode;
  setSortMode: (v: LowStockSortMode) => void;
  renderMgmtCell: (k: string, act: any, meta: UpsertMeta) => React.ReactNode;
};

const LowStockPanel: React.FC<Props> = ({ rows, sortMode, setSortMode, renderMgmtCell }) => {
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-header" style={{ paddingBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            {sectionHeader("Low Stock", rows.length, rows.length > 0 ? "warn" : "neutral")}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
              Sort
            </div>
            <select
              className="input"
              style={{ height: 34, width: 190, fontSize: 13 }}
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as LowStockSortMode)}
            >
              <option value="SEVERITY">Severity (default)</option>
              <option value="LOWEST_AVAILABLE">Lowest available</option>
              <option value="STATUS_PRIORITY">Status priority</option>
              <option value="MATERIAL">Material code</option>
            </select>
          </div>
        </div>
      </div>

      <div
        className="table-wrap"
        style={{ paddingTop: 6, maxHeight: 360, overflow: "auto", borderRadius: 12 }}
      >
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: "14%" }}>Material</th>
              <th style={{ ...thStyle, width: "22%" }}>Name</th>
              <th style={{ ...thStyle, width: "14%" }}>Category / Type</th>
              <th style={{ ...thStyle, textAlign: "right", width: "9%" }}>Available</th>
              <th style={{ ...thStyle, textAlign: "right", width: "9%" }}>Threshold</th>
              <th style={{ ...thStyle, width: "8%" }}>UOM</th>
              <th style={{ ...thStyle, width: "24%" }}>Alert management</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td style={tdStyle} colSpan={7} className="muted">
                  No low stock alerts triggered.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.key}
                  style={{
                    background: r.severity === "critical" ? "rgba(239, 68, 68, 0.06)" : "transparent",
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{r.material_code}</td>
                  <td style={tdStyle}>{r.name}</td>
                  <td style={tdStyle} className="muted">
                    {r.category_code} / {r.type_code}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatQty(r.available_qty)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatQty(r.threshold_qty)}
                  </td>
                  <td style={tdStyle}>{r.base_uom_code}</td>
                  <td style={tdStyle}>
                    {renderMgmtCell(r.key, r.action, {
                      alert_type: "LOW_STOCK",
                      material_code: r.material_code,
                      lot_number: null,
                      last_seen_available_qty: r.available_qty,
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LowStockPanel;
