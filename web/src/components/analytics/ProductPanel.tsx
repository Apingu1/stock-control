import React from "react";
import { buildCsv, downloadCsv } from "./csv";
import { Chip, dtFmt, money } from "./analyticsShared";
import type { ProductBatchRow, ProductSummary } from "./analyticsShared";
import { escapeHtml, moneyText, openPrintWindow } from "./reportPrint";

const formatBatchOutput = (batch: ProductBatchRow): string => {
  const size = batch.total_batch_size === null ? null : Number(batch.total_batch_size);
  const units = batch.number_of_units === null ? null : Number(batch.number_of_units);
  const uom = batch.batch_size_uom?.trim();
  if ((size === null || !Number.isFinite(size)) && (units === null || !Number.isFinite(units))) {
    return "—";
  }

  const parts: string[] = [];
  if (size !== null && Number.isFinite(size)) {
    parts.push(
      `${size.toLocaleString("en-GB", { maximumFractionDigits: 6 })}${uom ? ` ${uom}` : ""}`
    );
  }
  if (units !== null && Number.isFinite(units)) {
    parts.push(
      `${units.toLocaleString("en-GB", { maximumFractionDigits: 0 })} ${units === 1 ? "unit" : "units"}`
    );
  }
  return parts.join(" • ") || "—";
};

export const ProductPanel: React.FC<{
  productCode: string;
  dateFrom: string;
  dateTo: string;
  summary: ProductSummary | null;
  batches: ProductBatchRow[];
  onOpenBatch: (batchNo: string) => void;
}> = ({ productCode, dateFrom, dateTo, summary, batches, onOpenBatch }) => {
  function exportCsv() {
    if (!summary) return;

    const headers = [
      "date_from",
      "date_to",
      "es_product_code",
      "unique_batches",
      "total_recorded_batches",
      "rejected_batches",
      "cancelled_batches",
      "total_cost",
      "avg_cost_per_batch",
      "batch_no",
      "total_batch_size",
      "batch_size_uom",
      "number_of_units",
      "batch_total_cost",
      "first_issue_at",
      "last_issue_at",
      "batch_disposition",
      "disposition_reason",
    ];

    const out: unknown[][] = [];
    out.push([
      dateFrom,
      dateTo,
      summary.es_product_code,
      summary.unique_batches,
      summary.total_recorded_batches,
      summary.rejected_batches,
      summary.cancelled_batches,
      summary.total_cost,
      summary.avg_cost_per_batch,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);

    for (const b of batches) {
      out.push([
        dateFrom,
        dateTo,
        summary.es_product_code,
        summary.unique_batches,
        summary.total_recorded_batches,
        summary.rejected_batches,
        summary.cancelled_batches,
        summary.total_cost,
        summary.avg_cost_per_batch,
        b.product_batch_no,
        b.total_batch_size,
        b.batch_size_uom,
        b.number_of_units,
        b.batch_total_cost,
        b.first_issue_at,
        b.last_issue_at,
        b.batch_disposition,
        b.disposition_reason || "",
      ]);
    }

    downloadCsv(`analytics_product_${productCode}_${dateFrom}_to_${dateTo}.csv`, buildCsv(headers, out));
  }

  function exportPdf() {
    if (!summary) return;

    const hdr = `
      <div class="hdr">
        <div>
          <h1 class="h1">${escapeHtml(`Product Analytics: ${productCode}`)}</h1>
          <div class="sub">
            <span class="pill">Date range: <span class="mono">${escapeHtml(dateFrom)} → ${escapeHtml(dateTo)}</span></span>
          </div>
        </div>
        <div class="pill">Stock Control • Analytics</div>
      </div>
      <div class="grid">
        <div class="kpi"><div class="lab">Compliant manufactured batches</div><div class="val">${escapeHtml(summary.unique_batches)}</div></div>
        <div class="kpi"><div class="lab">Rejected / cancelled</div><div class="val">${escapeHtml(`${summary.rejected_batches} / ${summary.cancelled_batches}`)}</div></div>
        <div class="kpi"><div class="lab">Total cost</div><div class="val">${escapeHtml(moneyText(summary.total_cost))}</div></div>
        <div class="kpi"><div class="lab">Avg cost / batch</div><div class="val">${escapeHtml(moneyText(summary.avg_cost_per_batch))}</div></div>
      </div>
    `;

    const tableRows = (batches || [])
      .map(
        (b) => `
        <tr>
          <td class="mono">${escapeHtml(b.product_batch_no)}</td>
          <td class="mono">${escapeHtml(b.batch_disposition)}</td>
          <td class="mono">${escapeHtml(formatBatchOutput(b))}</td>
          <td class="mono">${escapeHtml(moneyText(b.batch_total_cost))}</td>
          <td class="mono">${escapeHtml(b.first_issue_at ? dtFmt(b.first_issue_at) : "")}</td>
          <td class="mono">${escapeHtml(b.last_issue_at ? dtFmt(b.last_issue_at) : "")}</td>
        </tr>
      `
      )
      .join("");

    const body = `
      ${hdr}
      <div class="card">
        <div class="ct">Batches (as shown)</div>
        <table>
          <thead><tr><th>ES batch no</th><th>Disposition</th><th class="mono">Batch output</th><th class="mono">Total cost</th><th class="mono">First issue</th><th class="mono">Last issue</th></tr></thead>
          <tbody>${tableRows || `<tr><td colspan="6" class="muted">No batches in range.</td></tr>`}</tbody>
        </table>
      </div>
    `;

    openPrintWindow(`product_${productCode}_${dateFrom}_to_${dateTo}`, body);
  }

  return (
    <div className="analytics-stack">
      <div className="card analytics-card">
        <div className="analytics-cardhead">
          <div>
            <div className="card-title">
              Product Analytics <Chip variant="green">{productCode}</Chip>
            </div>
            <div className="card-subtitle">Date range filtered totals + batch list.</div>
          </div>

          <div className="analytics-toolbar">
            <button className="btn-secondary" onClick={exportCsv} disabled={!summary}>
              ⬇ CSV Export
            </button>
            <button className="btn-secondary" onClick={exportPdf} disabled={!summary}>
              🖨 PDF Report
            </button>
          </div>
        </div>

        <div className="analytics-metricgrid">
          <div className="metric-card">
            <div className="metric-label">Compliant manufactured batches</div>
            <div className="metric-value">{summary?.unique_batches ?? "-"}</div>
            <div className="metric-sub">Rejected and cancelled are excluded</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total cost</div>
            <div className="metric-value">{money(summary?.total_cost ?? "0")}</div>
            <div className="metric-sub">Sum of ISSUE total_value</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Rejected / cancelled</div>
            <div className="metric-value">{summary ? `${summary.rejected_batches} / ${summary.cancelled_batches}` : "-"}</div>
            <div className="metric-sub">Clearly separated batch outcomes</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Avg cost / batch</div>
            <div className="metric-value">{money(summary?.avg_cost_per_batch ?? "0")}</div>
            <div className="metric-sub">Total cost ÷ unique batches</div>
          </div>
        </div>
      </div>

      <div className="card analytics-card">
        <div className="analytics-tablehead">
          <div className="rowline">
            <Chip variant="green">Batches</Chip>
            <span className="muted">{batches.length} row(s)</span>
          </div>
        </div>

        <div className="analytics-tablewrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>ES batch no</th>
                <th>Disposition</th>
                <th>Batch output</th>
                <th>Total cost</th>
                <th>First issue</th>
                <th>Last issue</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.product_batch_no} className={b.batch_disposition === "REJECTED" ? "batch-row-rejected" : b.batch_disposition === "CANCELLED" ? "batch-row-cancelled" : ""}>
                  <td className="mono">
                    <button className="link mono" onClick={() => onOpenBatch(b.product_batch_no)}>
                      {b.product_batch_no}
                    </button>
                  </td>
                  <td title={b.disposition_reason || ""}><span className={`disposition-badge disposition-${b.batch_disposition.toLowerCase()}`}>{b.batch_disposition}</span></td>
                  <td className="mono">{formatBatchOutput(b)}</td>
                  <td className="mono">{money(b.batch_total_cost)}</td>
                  <td className="mono">{dtFmt(b.first_issue_at)}</td>
                  <td className="mono">{dtFmt(b.last_issue_at)}</td>
                </tr>
              ))}
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No batches found for this product in the selected date range.
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

export default ProductPanel;
