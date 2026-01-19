// web/src/components/alerts/LowExpiryPanel.tsx
import React from "react";
import type { LowExpiryRow, LowExpirySortMode, UpsertMeta } from "./alertsTypes";
import { sectionHeader, tableStyle, tdStyle, thStyle, formatQty } from "./alertsUi";

type Props = {
  rows: LowExpiryRow[];
  sortMode: LowExpirySortMode;
  setSortMode: (v: LowExpirySortMode) => void;
  renderMgmtCell: (k: string, act: any, meta: UpsertMeta) => React.ReactNode;
};

const LowExpiryPanel: React.FC<Props> = ({ rows, sortMode, setSortMode, renderMgmtCell }) => {
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-header" style={{ paddingBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            {sectionHeader("Low Expiry", rows.length, rows.length > 0 ? "warn" : "neutral")}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
              Sort
            </div>
            <select
              className="input"
              style={{ height: 34, width: 210, fontSize: 13 }}
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as LowExpirySortMode)}
            >
              <option value="SOONEST_AQ">Soonest Days to AQ (default)</option>
              <option value="SOONEST_EXPIRY">Soonest expiry</option>
              <option value="STATUS_PRIORITY">Status priority</option>
              <option value="MATERIAL">Material code</option>
            </select>
          </div>
        </div>
      </div>

      <div
        className="table-wrap"
        style={{ paddingTop: 6, maxHeight: 420, overflow: "auto", borderRadius: 12 }}
      >
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: "14%" }}>Material</th>
              <th style={{ ...thStyle, width: "22%" }}>Name</th>
              <th style={{ ...thStyle, width: "14%" }}>Lot</th>
              <th style={{ ...thStyle, width: "14%" }}>Expiry</th>
              <th style={{ ...thStyle, textAlign: "right", width: "8%" }}>Days to expiry</th>
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
              <th style={{ ...thStyle, textAlign: "right", width: "8%" }}>Alert days</th>
              <th style={{ ...thStyle, textAlign: "right", width: "10%" }}>Qty</th>
              <th style={{ ...thStyle, width: "24%" }}>Alert management</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td style={tdStyle} colSpan={9} className="muted">
                  No low expiry alerts triggered.
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
                  <td style={tdStyle}>{r.lot_number}</td>
                  <td style={tdStyle}>{r.expiry_date}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {r.days_to_expiry}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {r.days_to_quarantine === null ? "—" : r.days_to_quarantine}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {r.alert_days}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatQty(r.qty)}
                  </td>
                  <td style={tdStyle}>
                    {renderMgmtCell(r.key, r.action, {
                      alert_type: "LOW_EXPIRY",
                      material_code: r.material_code,
                      lot_number: r.lot_number,
                      last_seen_available_qty: null,
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

export default LowExpiryPanel;
