import React, { useEffect, useMemo, useState } from "react";
import { buildCsv, downloadCsv } from "./csv";
import { Chip, money, qtyFmt } from "./analyticsShared";
import type { MaterialMonthlyRow, MaterialSummary } from "./analyticsShared";
import type { MaterialLotRow, MaterialTraceRow } from "./AnalyticsView";

type Tab = "overview" | "lots";

export const MaterialPanel: React.FC<{
  materialCode: string;
  dateFrom: string;
  dateTo: string;
  summary: MaterialSummary | null;
  monthly: MaterialMonthlyRow[];

  // ✅ Phase-3B lifted state
  lots: MaterialLotRow[];
  trace: MaterialTraceRow[];
  lotFilter: string;
  setLotFilter: React.Dispatch<React.SetStateAction<string>>;

  // ✅ Optional: set when arriving from SearchModal lot result
  initialLotFilter?: string;
}> = ({
  materialCode,
  dateFrom,
  dateTo,
  summary,
  monthly,
  lots,
  trace,
  lotFilter,
  setLotFilter,
  initialLotFilter,
}) => {
  const [tab, setTab] = useState<Tab>("overview");

  const title = useMemo(() => summary?.material_name || "", [summary]);

  // If we land here from a LOT search, auto-apply and switch tab
  useEffect(() => {
    if (initialLotFilter && initialLotFilter.trim()) {
      setTab("lots");
      setLotFilter(initialLotFilter.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialCode, initialLotFilter]);

  const lotsFiltered = useMemo(() => {
    const f = lotFilter.trim().toLowerCase();
    if (!f) return lots;
    return lots.filter((r) => (r.lot_number || "").toLowerCase().includes(f));
  }, [lots, lotFilter]);

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
      `analytics_material_${summary.material_code}_${dateFrom}_to_${dateTo}.csv`,
      buildCsv(headers, rows)
    );
  }

  function exportLotsCsv() {
    const headers = [
      "material_code",
      "date_from",
      "date_to",
      "lot_number",
      "status",
      "current_qty",
      "expiry_date",
      "first_txn_at",
      "last_txn_at",
    ];

    const rows: any[][] = lotsFiltered.map((r) => [
      materialCode,
      dateFrom,
      dateTo,
      r.lot_number,
      r.status,
      r.current_qty,
      r.expiry_date || "",
      r.first_txn_at || "",
      r.last_txn_at || "",
    ]);

    downloadCsv(
      `analytics_material_${materialCode}_lots_${dateFrom}_to_${dateTo}.csv`,
      buildCsv(headers, rows)
    );
  }

  function exportTraceCsv() {
    const headers = [
      "material_code",
      "date_from",
      "date_to",
      "product_batch_no",
      "es_product_code",
      "lot_number",
      "issue_qty_sum",
      "issue_value_sum",
      "last_issue_at",
    ];

    const rows: any[][] = trace.map((r) => [
      materialCode,
      dateFrom,
      dateTo,
      r.product_batch_no,
      r.es_product_code || "",
      r.lot_number || "",
      r.issue_qty_sum,
      r.issue_value_sum,
      r.last_issue_at || "",
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
          <button
            className={tab === "overview" ? "analytics-tab active" : "analytics-tab"}
            onClick={() => setTab("overview")}
          >
            Overview
          </button>
          <button
            className={tab === "lots" ? "analytics-tab active" : "analytics-tab"}
            onClick={() => setTab("lots")}
          >
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
                <div className="metric-value">
                  {money(summary?.receipt_value_total != null ? String(summary.receipt_value_total) : "0")}
                </div>
                <div className="metric-sub">Total receipt value in range</div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Consumption cost (issues)</div>
                <div className="metric-value">
                  {money(summary?.issue_value_total != null ? String(summary.issue_value_total) : "0")}
                </div>
                <div className="metric-sub">Total issue value in range</div>
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
                      <td className="mono">{money(String(r.issue_value_sum))}</td>
                      <td className="mono">{qtyFmt(r.receipt_qty_sum)}</td>
                      <td className="mono">{money(String(r.receipt_value_sum))}</td>
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
          </>
        ) : (
          <>
            <div className="card analytics-card" style={{ marginTop: 10 }}>
              <div className="rowline" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div className="card-title">Lot filter</div>
                  <div className="card-subtitle">Optional: filters both tables by lot number (partial match).</div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    className="analytics-input"
                    value={lotFilter}
                    onChange={(e) => setLotFilter(e.target.value)}
                    placeholder="e.g. LOT123 / partial"
                    style={{ width: 280 }}
                  />
                  <button className="btn-secondary" onClick={() => setLotFilter("")}>
                    Clear
                  </button>
                </div>
              </div>
            </div>

            <div className="analytics-tablehead" style={{ marginTop: 10 }}>
              <div className="rowline">
                <Chip variant="green">Lots in scope</Chip>
                <span className="muted">{lotsFiltered.length} lot(s)</span>
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
                  {lotsFiltered.map((r) => (
                    <tr key={`${r.material_lot_id}-${r.lot_number}`}>
                      <td className="mono">{r.lot_number}</td>
                      <td className="mono">{r.status}</td>
                      <td className="mono">{qtyFmt(r.current_qty)}</td>
                      <td className="mono">{r.expiry_date || ""}</td>
                      <td className="mono">{r.first_txn_at || ""}</td>
                      <td className="mono">{r.last_txn_at || ""}</td>
                    </tr>
                  ))}
                  {lotsFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        No lots in this date range (or match your filter).
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="analytics-tablehead" style={{ marginTop: 16 }}>
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
                    <th>Lot</th>
                    <th>Product code</th>
                    <th>Issue qty</th>
                    <th>Issue cost</th>
                    <th>Last issue</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.map((r, idx) => (
                    <tr key={`${r.product_batch_no}-${r.lot_number || ""}-${idx}`}>
                      <td className="mono">{r.product_batch_no}</td>
                      <td className="mono">{r.lot_number || ""}</td>
                      <td className="mono">{r.es_product_code || ""}</td>
                      <td className="mono">{qtyFmt(r.issue_qty_sum)}</td>
                      <td className="mono">{money(String(r.issue_value_sum))}</td>
                      <td className="mono">{r.last_issue_at || ""}</td>
                    </tr>
                  ))}
                  {trace.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        No traceability rows in this date range (or match your filter).
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MaterialPanel;
