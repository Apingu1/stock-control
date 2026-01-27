import React, { useMemo } from "react";
import { buildCsv, downloadCsv } from "./csv";
import { Chip, isRangeDash, money } from "./analyticsShared";
import type { DashSort, DashView, DashboardRangeResp } from "./analyticsShared";

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

    if (dashView === "product") {
      for (const p of rangeDash.by_product) {
        out.push([
          dateFrom,
          dateTo,
          rangeDash.kpis.receipt_total_value,
          rangeDash.kpis.issue_total_value,
          rangeDash.kpis.unique_batches_issued,
          "product",
          p.es_product_code,
          "",
          p.unique_batches,
          p.avg_cost_per_batch,
          p.total_cost,
        ]);
      }
    } else {
      for (const m of rangeDash.by_material) {
        out.push([
          dateFrom,
          dateTo,
          rangeDash.kpis.receipt_total_value,
          rangeDash.kpis.issue_total_value,
          rangeDash.kpis.unique_batches_issued,
          "material",
          m.material_code,
          m.material_name || "",
          m.unique_batches,
          m.avg_cost_per_batch,
          m.total_cost,
        ]);
      }
    }

    downloadCsv(`analytics_dashboard_${dashView}_${dateFrom}_to_${dateTo}.csv`, buildCsv(headers, out));
  }

  if (!rangeDash) {
    return (
      <div className="card analytics-card">
        <div className="card-title">Analytics Dashboard</div>
        <div className="card-subtitle">Loading…</div>
      </div>
    );
  }

  return (
    <div className="analytics-stack">
      <div className="card analytics-card">
        <div className="analytics-cardhead">
          <div>
            <div className="card-title">Analytics Dashboard</div>
            <div className="card-subtitle">
              Filtered totals from <span className="mono">stock_transactions</span> (no historical recalculation).
            </div>
          </div>

          <div className="analytics-toolbar">
            <button className="btn-secondary" onClick={exportCsv}>
              ⬇ CSV Export
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
            <div className="metric-label">Total spend (Receipts)</div>
            <div className="metric-value">{money(rangeDash.kpis.receipt_total_value)}</div>
            <div className="metric-sub">Receipts posted in range</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total consumption cost (Issues)</div>
            <div className="metric-value">{money(rangeDash.kpis.issue_total_value)}</div>
            <div className="metric-sub">Issues posted in range</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Unique ES batches</div>
            <div className="metric-value">{rangeDash.kpis.unique_batches_issued ?? 0}</div>
            <div className="metric-sub">Distinct batch numbers in range</div>
          </div>
        </div>
      </div>

      <div className="card analytics-card">
        <div className="analytics-tablehead">
          <div className="rowline">
            <Chip variant={dashView === "product" ? "blue" : "green"}>
              {dashView === "product" ? "Products manufactured (filtered)" : "Materials used (filtered)"}
            </Chip>
            <span className="muted">Shows all entities in the selected date range.</span>
          </div>
        </div>

        <div className="analytics-tablewrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>{dashView === "product" ? "Product code" : "Material code"}</th>
                <th>{dashView === "product" ? "Unique batches" : "Unique batches fed into"}</th>
                <th>Avg cost per batch</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={`${x.kind}:${x.code}`}>
                  <td>
                    <button
                      className="link mono"
                      onClick={() => (x.kind === "product" ? onOpenProduct(x.code) : onOpenMaterial(x.code))}
                    >
                      {x.code}
                    </button>
                    {x.name ? <div className="muted">{x.name}</div> : null}
                  </td>
                  <td className="mono">{x.batches}</td>
                  <td className="mono">{money(x.avgCost)}</td>
                  <td>
                    <button
                      className="btn-mini"
                      onClick={() => (x.kind === "product" ? onOpenProduct(x.code) : onOpenMaterial(x.code))}
                    >
                      Open →
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No data found in this date range.
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
