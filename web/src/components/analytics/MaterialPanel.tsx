import React, { useEffect, useMemo, useState } from "react";
import { buildCsv, downloadCsv } from "./csv";
import { Chip, money, qtyFmt } from "./analyticsShared";
import type { MaterialMonthlyRow, MaterialSummary } from "./analyticsShared";
import type { MaterialLotRow, MaterialTraceRow } from "./AnalyticsView";
import { escapeHtml, moneyText, openPrintWindow } from "./reportPrint";

type Tab = "overview" | "lots";

export const MaterialPanel: React.FC<{
  materialCode: string;
  dateFrom: string;
  dateTo: string;
  summary: MaterialSummary | null;
  monthly: MaterialMonthlyRow[];

  lots: MaterialLotRow[];
  trace: MaterialTraceRow[];
  lotFilter: string;
  setLotFilter: React.Dispatch<React.SetStateAction<string>>;
  initialLotFilter?: string;
}> = ({ materialCode, dateFrom, dateTo, summary, monthly, lots, trace, lotFilter, setLotFilter, initialLotFilter }) => {
  const [tab, setTab] = useState<Tab>("overview");

  const title = useMemo(() => summary?.material_name || "", [summary]);

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

  /**
   * UI datetime formatter:
   * - Postgres can return microseconds (6dp) which JS Date doesn't parse reliably.
   * - Normalise and truncate fractional seconds to 3dp (ms) so Date() can parse.
   * - Format using en-GB for consistency with the Product page look/feel.
   */
  function dtUi(v: string | null | undefined) {
    if (!v) return "";
    const raw = String(v);

    // Common shapes we may see:
    //  - 2026-01-23T02:16:59.141442+00:00
    //  - 2026-01-23 02:16:59.141442+00:00
    //  - 2026-01-23T02:16:59+00:00
    //  - 2026-01-23T02:16:59.141Z
    let s = raw.trim();

    // replace first space between date/time with "T" (keeps timezone part intact)
    if (s.includes(" ") && !s.includes("T")) {
      const i = s.indexOf(" ");
      s = s.slice(0, i) + "T" + s.slice(i + 1);
    }

    // truncate microseconds -> milliseconds (keep 3 dp) when followed by Z or timezone
    // e.g. .141442+00:00 -> .141+00:00
    s = s.replace(/(\.\d{3})\d+(?=(Z|[+-]\d{2}:?\d{2})$)/, "$1");

    // also handle timestamps that might not have timezone suffix but do have long fractions
    // e.g. .141442 -> .141
    s = s.replace(/(\.\d{3})\d+$/, "$1");

    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return raw;

    // Match the Product page vibe (UK format)
    return d.toLocaleString("en-GB");
  }

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

    downloadCsv(`analytics_material_${summary.material_code}_${dateFrom}_to_${dateTo}.csv`, buildCsv(headers, rows));
  }

  function exportLotsCsv() {
    const headers = ["material_code", "date_from", "date_to", "lot_number", "status", "current_qty", "expiry_date", "first_txn_at", "last_txn_at"];

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

    downloadCsv(`analytics_material_${materialCode}_lots_${dateFrom}_to_${dateTo}.csv`, buildCsv(headers, rows));
  }

  function exportTraceCsv() {
    const headers = ["material_code", "date_from", "date_to", "product_batch_no", "es_product_code", "lot_number", "issue_qty_sum", "issue_value_sum", "last_issue_at"];

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

    downloadCsv(`analytics_material_${materialCode}_traceability_${dateFrom}_to_${dateTo}.csv`, buildCsv(headers, rows));
  }

  function exportPdf() {
    const titleLine = title ? `${materialCode} • ${title}` : materialCode;

    const hdr = `
      <div class="hdr">
        <div>
          <h1 class="h1">${escapeHtml(`Material Analytics: ${titleLine}`)}</h1>
          <div class="sub">
            <span class="pill">Date range: <span class="mono">${escapeHtml(dateFrom)} → ${escapeHtml(dateTo)}</span></span>
            <span class="pill" style="margin-left:8px;">Tab: <span class="mono">${escapeHtml(tab)}</span></span>
            ${tab === "lots" && lotFilter.trim() ? `<span class="pill" style="margin-left:8px;">Lot filter: <span class="mono">${escapeHtml(lotFilter.trim())}</span></span>` : ""}
          </div>
        </div>
        <div class="pill">Stock Control • Analytics</div>
      </div>
    `;

    const kpis = summary
      ? `
      <div class="grid">
        <div class="kpi"><div class="lab">Issued qty</div><div class="val">${escapeHtml(summary.issue_qty_total ?? "0")}</div></div>
        <div class="kpi"><div class="lab">Receipt value</div><div class="val">${escapeHtml(moneyText(summary.receipt_value_total))}</div></div>
        <div class="kpi"><div class="lab">Issue value</div><div class="val">${escapeHtml(moneyText(summary.issue_value_total))}</div></div>
      </div>
    `
      : "";

    const monthlyRows = monthly
      .map(
        (r) => `
        <tr>
          <td class="mono">${escapeHtml(r.month_bucket)}</td>
          <td class="mono">${escapeHtml(r.issue_qty_sum)}</td>
          <td class="mono">${escapeHtml(moneyText(r.issue_value_sum))}</td>
          <td class="mono">${escapeHtml(r.receipt_qty_sum)}</td>
          <td class="mono">${escapeHtml(moneyText(r.receipt_value_sum))}</td>
        </tr>
      `
      )
      .join("");

    const lotsRows = lotsFiltered
      .map(
        (r) => `
        <tr>
          <td class="mono">${escapeHtml(r.lot_number)}</td>
          <td class="mono">${escapeHtml(r.status)}</td>
          <td class="mono">${escapeHtml(r.current_qty)}</td>
          <td class="mono">${escapeHtml(r.expiry_date || "")}</td>
          <td class="mono">${escapeHtml(dtUi(r.first_txn_at) || "")}</td>
          <td class="mono">${escapeHtml(dtUi(r.last_txn_at) || "")}</td>
        </tr>
      `
      )
      .join("");

    const traceRows = trace
      .map(
        (r) => `
        <tr>
          <td class="mono">${escapeHtml(r.product_batch_no)}</td>
          <td class="mono">${escapeHtml(r.lot_number || "")}</td>
          <td class="mono">${escapeHtml(r.es_product_code || "")}</td>
          <td class="mono">${escapeHtml(r.issue_qty_sum)}</td>
          <td class="mono">${escapeHtml(moneyText(r.issue_value_sum))}</td>
          <td class="mono">${escapeHtml(dtUi(r.last_issue_at) || "")}</td>
        </tr>
      `
      )
      .join("");

    const body =
      tab === "overview"
        ? `
      ${hdr}
      ${kpis}
      <div class="card">
        <div class="ct">Monthly breakdown (as shown)</div>
        <table>
          <thead><tr><th>Month</th><th class="mono">Issue qty</th><th class="mono">Issue value</th><th class="mono">Receipt qty</th><th class="mono">Receipt value</th></tr></thead>
          <tbody>${monthlyRows || `<tr><td colspan="5" class="muted">No rows in range.</td></tr>`}</tbody>
        </table>
      </div>
    `
        : `
      ${hdr}
      ${kpis}
      <div class="card">
        <div class="ct">Lots (as shown)</div>
        <table>
          <thead><tr><th>Lot</th><th>Status</th><th class="mono">Current qty</th><th class="mono">Expiry</th><th class="mono">First txn</th><th class="mono">Last txn</th></tr></thead>
          <tbody>${lotsRows || `<tr><td colspan="6" class="muted">No lots in range (or match filter).</td></tr>`}</tbody>
        </table>
      </div>
      <div class="card">
        <div class="ct">Traceability (as shown)</div>
        <table>
          <thead><tr><th>ES batch no</th><th class="mono">Lot</th><th class="mono">Product</th><th class="mono">Issue qty</th><th class="mono">Issue cost</th><th class="mono">Last issue</th></tr></thead>
          <tbody>${traceRows || `<tr><td colspan="6" class="muted">No traceability rows in range (or match filter).</td></tr>`}</tbody>
        </table>
      </div>
    `;

    openPrintWindow(`material_${materialCode}_${dateFrom}_to_${dateTo}`, body);
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
              <>
                <button className="btn-secondary" onClick={exportOverviewCsv} disabled={!summary}>
                  ⬇ CSV Export
                </button>
                <button className="btn-secondary" onClick={exportPdf} disabled={!summary}>
                  🖨 PDF Report
                </button>
              </>
            ) : (
              <>
                <button className="btn-secondary" onClick={exportLotsCsv}>
                  ⬇ Export Lots CSV
                </button>
                <button className="btn-secondary" onClick={exportTraceCsv}>
                  ⬇ Export Traceability CSV
                </button>
                <button className="btn-secondary" onClick={exportPdf}>
                  🖨 PDF Report
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
                <div className="metric-value">{money(summary?.receipt_value_total != null ? String(summary.receipt_value_total) : "0")}</div>
                <div className="metric-sub">Total receipt value in range</div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Consumption cost (issues)</div>
                <div className="metric-value">{money(summary?.issue_value_total != null ? String(summary.issue_value_total) : "0")}</div>
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
                      <td className="mono">{dtUi(r.first_txn_at) || ""}</td>
                      <td className="mono">{dtUi(r.last_txn_at) || ""}</td>
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
                      <td className="mono">{dtUi(r.last_issue_at) || ""}</td>
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
