import React, { useMemo, useState } from "react";
import { buildCsv, downloadCsv } from "./csv";
import { Chip, dtFmt, money, qtyFmt } from "./analyticsShared";
import type { MaterialMonthlyRow, MaterialSummary } from "./analyticsShared";

/** Phase 3B: local types so we don't need to touch analyticsShared.tsx */
export type MaterialLotRow = {
  material_lot_id: number;
  lot_number: string;
  status: string;
  current_qty: string;
  expiry_date: string | null;
  first_txn_at: string | null;
  last_txn_at: string | null;
};

export type MaterialTraceRow = {
  product_batch_no: string;
  es_product_code: string;
  issue_qty_sum: string;
  issue_value_sum: string;
  last_issue_at: string | null;
};

type Tab = "overview" | "lots";

export const MaterialPanel: React.FC<{
  materialCode: string;
  dateFrom: string;
  dateTo: string;
  summary: MaterialSummary | null;
  monthly: MaterialMonthlyRow[];

  // Phase 3B:
  lots: MaterialLotRow[];
  trace: MaterialTraceRow[];
  lotFilter: string;
  setLotFilter: (v: string) => void;
}> = ({ materialCode, dateFrom, dateTo, summary, monthly, lots, trace, lotFilter, setLotFilter }) => {
  const [tab, setTab] = useState<Tab>("overview");
  const title = useMemo(() => summary?.material_name || "", [summary]);

  function exportOverviewCsv() {
    if (!summary) return;
    const headers = [
      "date_from",
      "date_to",
      "material_code",
      "material_name",
      "issue_qty_total",
      "issue_value_total",
      "receipt_qty_total",
      "receipt_value_total",
      "avg_daily_usage",
      "month_bucket",
      "issue_qty_sum",
      "issue_value_sum",
      "receipt_qty_sum",
      "receipt_value_sum",
    ];
    const rows: any[][] = [];
    rows.push([
      dateFrom,
      dateTo,
      summary.material_code,
      summary.material_name,
      summary.issue_qty_total,
      summary.issue_value_total,
      summary.receipt_qty_total,
      summary.receipt_value_total,
      summary.avg_daily_usage,
      "",
      "",
      "",
      "",
      "",
    ]);
    for (const r of monthly) {
      rows.push([
        dateFrom,
        dateTo,
        r.material_code,
        r.material_name,
        "",
        "",
        "",
        "",
        "",
        r.month_bucket,
        r.issue_qty_sum,
        r.issue_value_sum,
        r.receipt_qty_sum,
        r.receipt_value_sum,
      ]);
    }
    downloadCsv(
      `analytics_material_${summary.material_code}_overview_${dateFrom}_to_${dateTo}.csv`,
      buildCsv(headers, rows)
    );
  }

  function exportLotsCsv() {
    const headers = [
      "date_from",
      "date_to",
      "material_code",
      "lot_filter",
      "material_lot_id",
      "lot_number",
      "status",
      "current_qty",
      "expiry_date",
      "first_txn_at",
      "last_txn_at",
    ];
    const rows = lots.map((l) => [
      dateFrom,
      dateTo,
      materialCode,
      lotFilter || "",
      l.material_lot_id,
      l.lot_number,
      l.status,
      l.current_qty,
      l.expiry_date || "",
      l.first_txn_at || "",
      l.last_txn_at || "",
    ]);
    downloadCsv(`analytics_material_${materialCode}_lots_${dateFrom}_to_${dateTo}.csv`, buildCsv(headers, rows));
  }

  function exportTraceCsv() {
    const headers = [
      "date_from",
      "date_to",
      "material_code",
      "lot_filter",
      "product_batch_no",
      "es_product_code",
      "issue_qty_sum",
      "issue_value_sum",
      "last_issue_at",
    ];
    const rows = trace.map((t) => [
      dateFrom,
      dateTo,
      materialCode,
      lotFilter || "",
      t.product_batch_no,
      t.es_product_code,
      t.issue_qty_sum,
      t.issue_value_sum,
      t.last_issue_at || "",
    ]);
    downloadCsv(
      `analytics_material_${materialCode}_traceability_${dateFrom}_to_${dateTo}.csv`,
      buildCsv(headers, rows)
    );
  }

  return (
    <div className="analytics-stack">
      <div className="card analytics-card">
        <div className="analytics-cardhead">
          <div>
            <div className="card-title">
              Material Analytics <Chip variant="green">{materialCode}</Chip>
            </div>

            <div className="card-subtitle">
              {title ? (
                <>
                  <span className="muted">{title}</span>
                  <span className="muted"> • </span>
                </>
              ) : null}
              Date range filtered totals + monthly breakdown.
            </div>
          </div>

          <div className="analytics-toolbar">
            {tab === "overview" ? (
              <button className="btn-secondary" onClick={exportOverviewCsv} disabled={!summary}>
                ⬇ CSV Export
              </button>
            ) : (
              <>
                <button className="btn-secondary" onClick={exportLotsCsv}>
                  ⬇ Export Lots CSV
                </button>
                <button className="btn-secondary" onClick={exportTraceCsv}>
                  ⬇ Export Traceability CSV
                </button>
              </>
            )}
          </div>
        </div>

        <div className="analytics-tabs">
          <button className={tab === "overview" ? "analytics-tab active" : "analytics-tab"} onClick={() => setTab("overview")}>
            Overview
          </button>
          <button className={tab === "lots" ? "analytics-tab active" : "analytics-tab"} onClick={() => setTab("lots")}>
            Lots & Traceability
          </button>
        </div>

        {tab === "overview" ? (
          <>
            <div className="analytics-metricgrid">
              <div className="metric-card">
                <div className="metric-label">Usage (issues)</div>
                <div className="metric-value">{qtyFmt(summary?.issue_qty_total)}</div>
                <div className="metric-sub">Total issued qty in range</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Spend (receipts)</div>
                <div className="metric-value">{money(summary?.receipt_value_total)}</div>
                <div className="metric-sub">Total receipt value in range</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Suggested low-stock (advisory)</div>
                <div className="metric-value">{qtyFmt(summary?.suggested_low_stock_threshold)}</div>
                <div className="metric-sub">Configured threshold (no auto actions)</div>
              </div>
            </div>

            <div className="analytics-tablehead" style={{ marginTop: 10 }}>
              <div className="rowline">
                <Chip variant="green">Monthly breakdown</Chip>
                <span className="muted">{monthly.length} row(s)</span>
              </div>
            </div>

            <div className="analytics-tablewrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Issue qty</th>
                    <th>Issue value</th>
                    <th>Receipt qty</th>
                    <th>Receipt value</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((r) => (
                    <tr key={r.month_bucket}>
                      <td className="mono">{r.month_bucket}</td>
                      <td className="mono">{qtyFmt(r.issue_qty_sum)}</td>
                      <td className="mono">{money(r.issue_value_sum)}</td>
                      <td className="mono">{qtyFmt(r.receipt_qty_sum)}</td>
                      <td className="mono">{money(r.receipt_value_sum)}</td>
                    </tr>
                  ))}
                  {monthly.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        No monthly data for this material in the selected date range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="analytics-note" style={{ marginTop: 12 }}>
              <strong>Calculation notes</strong>
              <ul className="analytics-notes-list">
                {(summary?.calc_notes || []).map((n, i) => (
                  <li key={i} className="muted">
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <>
            <div className="card analytics-card" style={{ marginTop: 12 }}>
              <div className="analytics-cardhead">
                <div>
                  <div className="card-title">Lot filter</div>
                  <div className="card-subtitle">Optional: filter both tables by lot number (partial match).</div>
                </div>
                <div className="analytics-toolbar">
                  <input
                    className="analytics-input"
                    placeholder="e.g. LOT123 / partial"
                    value={lotFilter}
                    onChange={(e) => setLotFilter(e.target.value)}
                    style={{ minWidth: 260 }}
                  />
                  <button className="btn-mini" onClick={() => setLotFilter("")} disabled={!lotFilter}>
                    Clear
                  </button>
                </div>
              </div>
            </div>

            <div className="card analytics-card">
              <div className="analytics-tablehead">
                <div className="rowline">
                  <Chip variant="green">Lots in scope</Chip>
                  <span className="muted">{lots.length} lot(s)</span>
                </div>
              </div>

              <div className="analytics-tablewrap">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Lot</th>
                      <th>Status</th>
                      <th>Current qty</th>
                      <th>Expiry</th>
                      <th>First txn in range</th>
                      <th>Last txn in range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((l) => (
                      <tr key={l.material_lot_id}>
                        <td className="mono">{l.lot_number}</td>
                        <td className="mono muted">{l.status}</td>
                        <td className="mono">{qtyFmt(l.current_qty)}</td>
                        <td className="mono muted">{l.expiry_date || "-"}</td>
                        <td className="mono muted">{dtFmt(l.first_txn_at)}</td>
                        <td className="mono muted">{dtFmt(l.last_txn_at)}</td>
                      </tr>
                    ))}
                    {lots.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted">
                          No lots found for this material in the selected range (and lot filter, if set).
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card analytics-card">
              <div className="analytics-tablehead">
                <div className="rowline">
                  <Chip variant="green">Traceability</Chip>
                  <span className="muted">{trace.length} row(s)</span>
                </div>
              </div>

              <div className="analytics-tablewrap">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>ES batch no</th>
                      <th>Product code</th>
                      <th>Issue qty</th>
                      <th>Issue cost</th>
                      <th>Last issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trace.map((t) => (
                      <tr key={`${t.product_batch_no}:${t.es_product_code}`}>
                        <td className="mono">{t.product_batch_no}</td>
                        <td className="mono muted">{t.es_product_code}</td>
                        <td className="mono">{qtyFmt(t.issue_qty_sum)}</td>
                        <td className="mono">{money(t.issue_value_sum)}</td>
                        <td className="mono muted">{dtFmt(t.last_issue_at)}</td>
                      </tr>
                    ))}
                    {trace.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="muted">
                          No traceability rows found (issues into batches) for this material in the selected range (and lot
                          filter, if set).
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MaterialPanel;
