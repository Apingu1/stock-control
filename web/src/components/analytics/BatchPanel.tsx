import React from "react";
import type { BatchAnalyticsResp } from "./analyticsShared";
import { Chip, dtFmt, money, qtyFmt } from "./analyticsShared";
import { buildCsv, downloadCsv } from "./csv";
import { escapeHtml, moneyText, openPrintWindow } from "./reportPrint";

export const BatchPanel: React.FC<{
  batchNo: string;
  batch: BatchAnalyticsResp | null;
  onOpenMaterial: (materialCode: string) => void;
}> = ({ batchNo, batch, onOpenMaterial }) => {
  function exportCsv() {
    if (!batch) return;

    const headers = [
      "product_batch_no",
      "es_product_code",
      "batch_total_cost",
      "issue_txn_count",
      "first_issue_at",
      "last_issue_at",
      "material_code",
      "material_name",
      "lot_number",
      "qty",
      "uom_code",
      "unit_price",
      "total_value",
    ];

    const out: any[][] = [];
    out.push([
      batch.header.product_batch_no,
      batch.header.es_product_code,
      batch.header.batch_total_cost,
      batch.header.issue_txn_count,
      batch.header.first_issue_at,
      batch.header.last_issue_at,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);

    for (const m of batch.materials || []) {
      out.push([
        batch.header.product_batch_no,
        batch.header.es_product_code,
        batch.header.batch_total_cost,
        batch.header.issue_txn_count,
        batch.header.first_issue_at,
        batch.header.last_issue_at,
        m.material_code,
        m.material_name,
        m.lot_number,
        m.qty,
        m.uom_code,
        m.unit_price ?? "",
        m.total_value ?? "",
      ]);
    }

    downloadCsv(`analytics_batch_${batchNo}.csv`, buildCsv(headers, out));
  }

  function exportPdf() {
    if (!batch) return;

    const hdr = `
      <div class="hdr">
        <div>
          <h1 class="h1">${escapeHtml(`Batch Analytics: ${batchNo}`)}</h1>
          <div class="sub">
            <span class="pill">Snapshot (no date filtering)</span>
            <span class="pill" style="margin-left:8px;">Product: <span class="mono">${escapeHtml(batch.header.es_product_code || "-")}</span></span>
          </div>
        </div>
        <div class="pill">Stock Control • Analytics</div>
      </div>
      <div class="grid">
        <div class="kpi"><div class="lab">Batch total cost</div><div class="val">${escapeHtml(moneyText(batch.header.batch_total_cost))}</div></div>
        <div class="kpi"><div class="lab">Issue rows</div><div class="val">${escapeHtml(batch.header.issue_txn_count ?? "-")}</div></div>
        <div class="kpi"><div class="lab">First → Last issue</div><div class="val">${escapeHtml(`${dtFmt(batch.header.first_issue_at)} → ${dtFmt(batch.header.last_issue_at)}`)}</div></div>
      </div>
    `;

    const rows = (batch.materials || [])
      .map(
        (m) => `
        <tr>
          <td><div class="mono">${escapeHtml(m.material_code)}</div><div class="muted">${escapeHtml(m.material_name || "")}</div></td>
          <td class="mono">${escapeHtml(m.lot_number || "")}</td>
          <td class="mono">${escapeHtml(m.qty)}</td>
          <td class="mono">${escapeHtml(m.uom_code)}</td>
          <td class="mono">${escapeHtml(m.unit_price ? moneyText(m.unit_price) : "")}</td>
          <td class="mono">${escapeHtml(m.total_value ? moneyText(m.total_value) : "")}</td>
        </tr>
      `
      )
      .join("");

    const body = `
      ${hdr}
      <div class="card">
        <div class="ct">Materials (as shown)</div>
        <table>
          <thead><tr><th>Material</th><th class="mono">Lot</th><th class="mono">Qty</th><th class="mono">UoM</th><th class="mono">Unit</th><th class="mono">Total</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6" class="muted">No materials found for this batch.</td></tr>`}</tbody>
        </table>
      </div>
    `;

    openPrintWindow(`batch_${batchNo}`, body);
  }

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

          <div className="analytics-toolbar">
            <button className="btn-secondary" onClick={exportCsv} disabled={!batch}>
              ⬇ CSV Export
            </button>
            <button className="btn-secondary" onClick={exportPdf} disabled={!batch}>
              🖨 PDF Report
            </button>
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

export default BatchPanel;
