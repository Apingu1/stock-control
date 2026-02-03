import React, { useMemo } from "react";
import { buildCsv, downloadCsv } from "./csv";
import { Chip, isRangeDash, money } from "./analyticsShared";
import type { DashSort, DashView, DashboardRangeResp } from "./analyticsShared";
import { escapeHtml, moneyText, openPrintWindow } from "./reportPrint";

export const DashboardPanel: React.FC<{
  dash: any; // DashboardResp, but we only render in range-mode
  dateFrom: string;
  dateTo: string;
  dashView: DashView;
  dashSort: DashSort;
  setDashView: (v: DashView) => void;
  setDashSort: (v: DashSort) => void;
  onOpenProduct: (code: string) => void;
  onOpenMaterial: (code: string) => void;
}> = ({ dash, dateFrom, dateTo, dashView, dashSort, setDashView, setDashSort, onOpenProduct, onOpenMaterial }) => {
  const rangeDash: DashboardRangeResp | null = isRangeDash(dash) ? (dash as DashboardRangeResp) : null;

  const rows = useMemo(() => {
    if (!rangeDash) return [];

    if (dashView === "product") {
      const arr = [...rangeDash.by_product].filter((x) => x.es_product_code);
      arr.sort((a, b) => {
        if (dashSort === "most_batches") return (b.unique_batches ?? 0) - (a.unique_batches ?? 0);
        if (dashSort === "least_batches") return (a.unique_batches ?? 0) - (b.unique_batches ?? 0);
        if (dashSort === "highest_avg_cost") return Number(b.avg_cost_per_batch) - Number(a.avg_cost_per_batch);
        if (dashSort === "lowest_avg_cost") return Number(a.avg_cost_per_batch) - Number(b.avg_cost_per_batch);
        return 0;
      });
      return arr.map((x) => ({
        kind: "product" as const,
        code: x.es_product_code,
        name: "",
        batches: x.unique_batches,
        avgCost: x.avg_cost_per_batch,
        totalCost: x.total_cost,
      }));
    }

    const arr = [...rangeDash.by_material].filter((x) => x.material_code);
    arr.sort((a, b) => {
      if (dashSort === "most_batches") return (b.unique_batches ?? 0) - (a.unique_batches ?? 0);
      if (dashSort === "least_batches") return (a.unique_batches ?? 0) - (b.unique_batches ?? 0);
      if (dashSort === "highest_avg_cost") return Number(b.avg_cost_per_batch) - Number(a.avg_cost_per_batch);
      if (dashSort === "lowest_avg_cost") return Number(a.avg_cost_per_batch) - Number(b.avg_cost_per_batch);
      return 0;
    });
    return arr.map((x) => ({
      kind: "material" as const,
      code: x.material_code,
      name: x.material_name || "",
      batches: x.unique_batches,
      avgCost: x.avg_cost_per_batch,
      totalCost: x.total_cost,
    }));
  }, [rangeDash, dashView, dashSort]);

  function exportCsv() {
    if (!rangeDash) return;

    const headers = [
      "date_from",
      "date_to",
      "total_spend_receipts",
      "total_consumption_issues",
      "unique_batches",
      "view",
      "entity_code",
      "entity_name",
      "unique_batches_in_entity",
      "avg_cost_per_batch",
      "total_cost_in_entity",
    ];

    const out: any[][] = [];
    out.push([
      dateFrom,
      dateTo,
      rangeDash.kpis.receipt_total_value,
      rangeDash.kpis.issue_total_value,
      rangeDash.kpis.unique_batches_issued,
      dashView,
      "",
      "",
      "",
      "",
      "",
    ]);

    // ✅ Export EXACTLY what is visible (sorted + current view)
    for (const r of rows) {
      out.push([
        dateFrom,
        dateTo,
        rangeDash.kpis.receipt_total_value,
        rangeDash.kpis.issue_total_value,
        rangeDash.kpis.unique_batches_issued,
        r.kind,
        r.code,
        r.name || "",
        r.batches,
        r.avgCost,
        r.totalCost,
      ]);
    }

    downloadCsv(`analytics_dashboard_${dashView}_${dateFrom}_to_${dateTo}.csv`, buildCsv(headers, out));
  }

  function exportPdf() {
    if (!rangeDash) return;

    const title = `Analytics Dashboard (${dashView})`;
    const hdr = `
      <div class="hdr">
        <div>
          <h1 class="h1">${escapeHtml(title)}</h1>
          <div class="sub">
            <span class="pill">Date range: <span class="mono">${escapeHtml(dateFrom)} → ${escapeHtml(dateTo)}</span></span>
            <span class="pill" style="margin-left:8px;">View: <span class="mono">${escapeHtml(dashView)}</span></span>
            <span class="pill" style="margin-left:8px;">Sort: <span class="mono">${escapeHtml(dashSort)}</span></span>
          </div>
        </div>
        <div class="pill">Stock Control • Analytics</div>
      </div>
      <div class="grid">
        <div class="kpi"><div class="lab">Total spend (receipts)</div><div class="val">${escapeHtml(moneyText(rangeDash.kpis.receipt_total_value))}</div></div>
        <div class="kpi"><div class="lab">Total consumption cost (issues)</div><div class="val">${escapeHtml(moneyText(rangeDash.kpis.issue_total_value))}</div></div>
        <div class="kpi"><div class="lab">Unique ES batches</div><div class="val">${escapeHtml(rangeDash.kpis.unique_batches_issued)}</div></div>
      </div>
    `;

    const tableHead = dashView === "product"
      ? `<tr><th>ES product code</th><th class="mono">Batches</th><th class="mono">Avg cost/batch</th><th class="mono">Total cost</th></tr>`
      : `<tr><th>Material</th><th class="mono">Batches</th><th class="mono">Avg cost/batch</th><th class="mono">Total cost</th></tr>`;

    const tableRows = rows
      .map((r) => {
        const left = r.kind === "material"
          ? `<div class="mono">${escapeHtml(r.code)}</div><div class="muted">${escapeHtml(r.name || "")}</div>`
          : `<div class="mono">${escapeHtml(r.code)}</div>`;
        return `
          <tr>
            <td>${left}</td>
            <td class="mono">${escapeHtml(r.batches)}</td>
            <td class="mono">${escapeHtml(moneyText(r.avgCost))}</td>
            <td class="mono">${escapeHtml(moneyText(r.totalCost))}</td>
          </tr>
        `;
      })
      .join("");

    const body = `
      ${hdr}
      <div class="card">
        <div class="ct">Entities</div>
        <table>
          <thead>${tableHead}</thead>
          <tbody>${tableRows || `<tr><td colspan="4" class="muted">No rows in range.</td></tr>`}</tbody>
        </table>
      </div>
    `;

    openPrintWindow(`dashboard_${dashView}_${dateFrom}_to_${dateTo}`, body);
  }

  if (!rangeDash) {
    return (
      <div className="card analytics-card">
        <div className="card-title">Analytics Dashboard</div>
        <div className="card-subtitle">Select a date range to view dashboard analytics.</div>
      </div>
    );
  }

  return (
    <div className="analytics-stack">
      <div className="card analytics-card">
        <div className="analytics-cardhead">
          <div>
            <div className="card-title">
              Analytics Dashboard <Chip variant="green">{dateFrom}</Chip> <span className="muted">→</span>{" "}
              <Chip variant="green">{dateTo}</Chip>
            </div>
            <div className="card-subtitle">Date range totals + grouped analytics by ES product or material.</div>
          </div>

          <div className="analytics-toolbar">
            <button className="btn-secondary" onClick={exportCsv}>
              ⬇ CSV Export
            </button>
            <button className="btn-secondary" onClick={exportPdf}>
              🖨 PDF Report
            </button>

            <select className="analytics-input" value={dashView} onChange={(e) => setDashView(e.target.value as DashView)}>
              <option value="product">ES Product view</option>
              <option value="material">Material view</option>
            </select>

            <select className="analytics-input" value={dashSort} onChange={(e) => setDashSort(e.target.value as DashSort)}>
              <option value="most_batches">Most → least manufactured</option>
              <option value="least_batches">Least → most manufactured</option>
              <option value="highest_avg_cost">Highest → lowest avg cost/batch</option>
              <option value="lowest_avg_cost">Lowest → highest avg cost/batch</option>
            </select>
          </div>
        </div>

        <div className="analytics-metricgrid">
          <div className="metric-card">
            <div className="metric-label">Total spend (receipts)</div>
            <div className="metric-value">{money(rangeDash.kpis.receipt_total_value)}</div>
            <div className="metric-sub">Sum of RECEIPT total_value</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total consumption cost (issues)</div>
            <div className="metric-value">{money(rangeDash.kpis.issue_total_value)}</div>
            <div className="metric-sub">Sum of ISSUE total_value</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Unique ES batches</div>
            <div className="metric-value">{rangeDash.kpis.unique_batches_issued}</div>
            <div className="metric-sub">Distinct product_batch_no in ISSUE rows</div>
          </div>
        </div>
      </div>

      <div className="card analytics-card">
        <div className="analytics-tablehead">
          <div className="rowline">
            <Chip variant="green">{dashView === "product" ? "Products" : "Materials"}</Chip>
            <span className="muted">{rows.length} row(s)</span>
          </div>
        </div>

        <div className="analytics-tablewrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>{dashView === "product" ? "ES product code" : "Material"}</th>
                <th>Batches</th>
                <th>Avg cost/batch</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.code}`}>
                  <td>
                    {r.kind === "product" ? (
                      <button className="link mono" onClick={() => onOpenProduct(r.code)}>
                        {r.code}
                      </button>
                    ) : (
                      <button className="link mono" onClick={() => onOpenMaterial(r.code)}>
                        {r.code}
                      </button>
                    )}
                    {r.kind === "material" && r.name ? <div className="muted">{r.name}</div> : null}
                  </td>
                  <td className="mono">{r.batches}</td>
                  <td className="mono">{money(r.avgCost)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    No results for the selected date range.
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

export default DashboardPanel;
