import React from "react";
import type { BatchAnalyticsResp } from "./analyticsShared";
import { Chip, dtFmt, money, qtyFmt } from "./analyticsShared";


export const BatchPanel: React.FC<{
  batchNo: string;
  batch: BatchAnalyticsResp | null;
  onOpenMaterial: (materialCode: string) => void;
}> = ({ batchNo, batch, onOpenMaterial }) => {
  return (
    <div className="analytics-stack">
      <div className="card analytics-card">
        <div className="analytics-cardhead">
          <div>
            <div className="card-title">
              Batch Analytics <Chip variant="purple">{batchNo}</Chip>
            </div>
            <div className="card-subtitle">Snapshot view (no date filtering). Costs are the ISSUE snapshots.</div>
          </div>
        </div>

        <div className="analytics-metricgrid">
          <div className="metric-card">
            <div className="metric-label">Batch total cost</div>
            <div className="metric-value">{money(batch?.header.batch_total_cost)}</div>
            <div className="metric-sub">Sum of ISSUE total_value for batch</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Issue rows</div>
            <div className="metric-value">{batch?.header.issue_txn_count ?? "-"}</div>
            <div className="metric-sub">Count of ISSUE txns</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Product code</div>
            <div className="metric-value mono">{batch?.header.es_product_code ?? "-"}</div>
            <div className="metric-sub">ES product code</div>
          </div>
        </div>

        <div className="analytics-minirow muted">
          <span>First issue: {dtFmt(batch?.header.first_issue_at)}</span>
          <span>Last issue: {dtFmt(batch?.header.last_issue_at)}</span>
        </div>
      </div>

      <div className="card analytics-card">
        <div className="analytics-tablehead">
          <div className="rowline">
            <Chip variant="purple">Materials</Chip>
            <span className="muted">{batch?.materials?.length ?? 0} row(s)</span>
          </div>
        </div>

        <div className="analytics-tablewrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Lot</th>
                <th>Qty</th>
                <th>UoM</th>
                <th>Unit</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {(batch?.materials || []).map((m) => (
                <tr key={m.stock_txn_id}>
                  <td>
                    <button className="link mono" onClick={() => onOpenMaterial(m.material_code)}>
                      {m.material_code}
                    </button>
                    <div className="muted">{m.material_name}</div>
                  </td>
                  <td className="mono muted">{m.lot_number}</td>
                  <td className="mono">{qtyFmt(m.qty)}</td>
                  <td className="mono muted">{m.uom_code}</td>
                  <td className="mono">{m.unit_price ? money(m.unit_price) : "-"}</td>
                  <td className="mono">{m.total_value ? money(m.total_value) : "-"}</td>
                </tr>
              ))}
              {!batch || batch.materials.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No materials found for this batch.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
