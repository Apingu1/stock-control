import React from "react";
import { buildCsv, downloadCsv } from "./csv";
import { Chip, dtFmt, money } from "./analyticsShared";
import type { ProductBatchRow, ProductSummary } from "./analyticsShared";

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
      "product_code",
      "unique_batches",
      "total_cost",
      "avg_cost_per_batch",
      "batch_no",
      "batch_total_cost",
      "issue_txn_count",
      "last_issue_at",
    ];
    const rows: any[][] = [];
    rows.push([dateFrom, dateTo, summary.es_product_code, summary.unique_batches, summary.total_cost, summary.avg_cost_per_batch, "", "", "", ""]);
    for (const b of batches) {
      rows.push([dateFrom, dateTo, summary.es_product_code, summary.unique_batches, summary.total_cost, summary.avg_cost_per_batch, b.product_batch_no, b.batch_total_cost, b.issue_txn_count, b.last_issue_at]);
    }
    downloadCsv(`analytics_product_${summary.es_product_code}_${dateFrom}_to_${dateTo}.csv`, buildCsv(headers, rows));
  }

  return (
    <div className="analytics-stack">
      <div className="card analytics-card">
        <div className="analytics-cardhead">
          <div>
            <div className="card-title">
              Product Analytics <Chip variant="blue">{productCode}</Chip>
            </div>
            <div className="card-subtitle">Date range filtered. Click a batch to drill down (batch page is snapshot).</div>
          </div>

          <div className="analytics-toolbar">
            <button className="btn-secondary" onClick={exportCsv} disabled={!summary}>
              ⬇ CSV Export
            </button>
          </div>
        </div>

        <div className="analytics-metricgrid">
          <div className="metric-card">
            <div className="metric-label">Batches manufactured</div>
            <div className="metric-value">{summary?.unique_batches ?? "-"}</div>
            <div className="metric-sub">Unique ES batch numbers</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total material cost</div>
            <div className="metric-value">{money(summary?.total_cost)}</div>
            <div className="metric-sub">Sum of ISSUE total_value</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Average cost per batch</div>
            <div className="metric-value">{money(summary?.avg_cost_per_batch)}</div>
            <div className="metric-sub">Total / unique batches</div>
          </div>
        </div>
      </div>

      <div className="card analytics-card">
        <div className="analytics-tablehead">
          <div className="rowline">
            <Chip variant="blue">Batches</Chip>
            <span className="muted">{batches.length} row(s)</span>
          </div>
        </div>

        <div className="analytics-tablewrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>ES batch no</th>
                <th>Total batch material cost</th>
                <th>Issue txn rows</th>
                <th>Last issue</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.product_batch_no}>
                  <td>
                    <button className="link mono" onClick={() => onOpenBatch(b.product_batch_no)}>
                      {b.product_batch_no}
                    </button>
                  </td>
                  <td className="mono">{money(b.batch_total_cost)}</td>
                  <td className="mono muted">{b.issue_txn_count}</td>
                  <td className="mono muted">{dtFmt(b.last_issue_at)}</td>
                </tr>
              ))}
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No batches found for this product code in the selected date range.
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
