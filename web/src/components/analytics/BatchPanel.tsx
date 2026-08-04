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
      "customer_name",
      "batch_total_cost",
      "issue_txn_count",
      "first_issue_at",
      "last_issue_at",
      "batch_disposition",
      "disposition_reason",
      "material_code",
      "material_name",
      "lot_number",
      "qty",
      "uom_code",
      "unit_price",
      "total_value",
    ];

    const out: unknown[][] = [];
    out.push([
      batch.header.product_batch_no,
      batch.header.es_product_code,
      batch.header.customer_name || "",
      batch.header.batch_total_cost,
      batch.header.issue_txn_count,
      batch.header.first_issue_at,
      batch.header.last_issue_at,
      batch.header.batch_disposition,
      batch.header.disposition_reason || "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);

    for (const material of batch.materials || []) {
      out.push([
        batch.header.product_batch_no,
        batch.header.es_product_code,
        batch.header.customer_name || "",
        batch.header.batch_total_cost,
        batch.header.issue_txn_count,
        batch.header.first_issue_at,
        batch.header.last_issue_at,
        batch.header.batch_disposition,
        batch.header.disposition_reason || "",
        material.material_code,
        material.material_name,
        material.lot_number,
        material.qty,
        material.uom_code,
        material.unit_price ?? "",
        material.total_value ?? "",
      ]);
    }

    downloadCsv(`analytics_batch_${batchNo}.csv`, buildCsv(headers, out));
  }

  function exportPdf() {
    if (!batch) return;

    const header = `
      <div class="hdr">
        <div>
          <h1 class="h1">${escapeHtml(`Batch Analytics: ${batchNo}`)}</h1>
          <div class="sub">
            <span class="pill">Snapshot (no date filtering)</span>
            <span class="pill" style="margin-left:8px;">Product: <span class="mono">${escapeHtml(batch.header.es_product_code || "-")}</span></span>
            <span class="pill" style="margin-left:8px;">Customer: <span class="mono">${escapeHtml(batch.header.customer_name || "-")}</span></span>
            <span class="pill" style="margin-left:8px;">Disposition: <span class="mono">${escapeHtml(batch.header.batch_disposition)}</span></span>
          </div>
        </div>
        <div class="pill">Stock Control • Analytics</div>
      </div>
      <div class="grid">
        <div class="kpi"><div class="lab">Customer</div><div class="val">${escapeHtml(batch.header.customer_name || "—")}</div></div>
        <div class="kpi"><div class="lab">Batch total cost</div><div class="val">${escapeHtml(moneyText(batch.header.batch_total_cost))}</div></div>
        <div class="kpi"><div class="lab">Issue rows</div><div class="val">${escapeHtml(batch.header.issue_txn_count ?? "-")}</div></div>
        <div class="kpi"><div class="lab">First → Last issue</div><div class="val">${escapeHtml(`${dtFmt(batch.header.first_issue_at)} → ${dtFmt(batch.header.last_issue_at)}`)}</div></div>
      </div>
      ${batch.header.disposition_reason ? `<div class="card"><div class="ct">Disposition reason</div><div>${escapeHtml(batch.header.disposition_reason)}</div></div>` : ""}
    `;

    const rows = (batch.materials || [])
      .map(
        (material) => `
        <tr>
          <td><div class="mono">${escapeHtml(material.material_code)}</div><div class="muted">${escapeHtml(material.material_name || "")}</div></td>
          <td class="mono">${escapeHtml(material.lot_number || "")}</td>
          <td class="mono">${escapeHtml(material.qty)}</td>
          <td class="mono">${escapeHtml(material.uom_code)}</td>
          <td class="mono">${escapeHtml(material.unit_price ? moneyText(material.unit_price) : "")}</td>
          <td class="mono">${escapeHtml(material.total_value ? moneyText(material.total_value) : "")}</td>
        </tr>
      `
      )
      .join("");

    const body = `
      ${header}
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
            <div className="card-subtitle">
              Snapshot view with customer, controlled batch details and ISSUE cost snapshots.
            </div>
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
            <div className="metric-label">Customer</div>
            <div className="metric-value">{batch?.header.customer_name || "—"}</div>
            <div className="metric-sub">Customer recorded at consumption</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Disposition</div>
            <div className="metric-value">
              <span
                className={`disposition-badge disposition-${(
                  batch?.header.batch_disposition || "COMPLIANT"
                ).toLowerCase()}`}
              >
                {batch?.header.batch_disposition || "COMPLIANT"}
              </span>
            </div>
            <div className="metric-sub">Structured batch outcome</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Batch total cost</div>
            <div className="metric-value">{money(batch?.header.batch_total_cost)}</div>
            <div className="metric-sub">Sum of ISSUE total_value for batch</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Issue rows</div>
            <div className="metric-value">{batch?.header.issue_txn_count ?? "-"}</div>
            <div className="metric-sub">Count of ISSUE transactions</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Product code</div>
            <div className="metric-value mono">{batch?.header.es_product_code ?? "-"}</div>
            <div className="metric-sub">ES product code</div>
          </div>
        </div>

        {batch && batch.header.batch_disposition !== "COMPLIANT" && (
          <div className="issue-compliance-panel">
            <strong>
              {batch.header.batch_disposition === "CANCELLED"
                ? "Cancelled BMR"
                : "Rejected batch"}
            </strong>
            <div>{batch.header.disposition_reason || "No reason recorded"}</div>
            {batch.header.compliance_triggers?.length > 0 && (
              <div>Triggers: {batch.header.compliance_triggers.join(", ")}</div>
            )}
            {batch.header.missing_material_codes?.length > 0 && (
              <div>Missing: {batch.header.missing_material_codes.join(", ")}</div>
            )}
            {batch.header.unexpected_material_codes?.length > 0 && (
              <div>Unexpected: {batch.header.unexpected_material_codes.join(", ")}</div>
            )}
            {batch.header.approved_by && <div>Approved by: {batch.header.approved_by}</div>}
          </div>
        )}

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
              {(batch?.materials || []).map((material) => (
                <tr key={material.stock_txn_id}>
                  <td>
                    <button className="link mono" onClick={() => onOpenMaterial(material.material_code)}>
                      {material.material_code}
                    </button>
                    <div className="muted">{material.material_name}</div>
                  </td>
                  <td className="mono muted">{material.lot_number}</td>
                  <td className="mono">{qtyFmt(material.qty)}</td>
                  <td className="mono muted">{material.uom_code}</td>
                  <td className="mono">{material.unit_price ? money(material.unit_price) : "-"}</td>
                  <td className="mono">{material.total_value ? money(material.total_value) : "-"}</td>
                </tr>
              ))}
              {!batch || batch.materials.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    {batch?.header.batch_disposition === "CANCELLED"
                      ? "Cancelled BMR — no materials, quantity or stock movement."
                      : "No materials found for this batch."}
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
