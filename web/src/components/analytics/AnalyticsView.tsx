import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api";
import { SearchModal } from "./SearchModal";
import type { SearchResult } from "./SearchModal";
import { buildCsv, downloadCsv, firstDayOfMonth, todayYmd } from "./csv";

type MonthlyRow = {
  month_bucket: string;
  receipt_total_value: string;
  issue_total_value: string;
  receipt_txn_count: number;
  issue_txn_count: number;
  unique_batches_issued: number;
};

type DashboardLegacyResp = {
  meta: { data_cut: string | null; timezone_month_bucket: string; logic_version: string };
  monthly: MonthlyRow[];
  top_products: { es_product_code: string; unique_batch_count: number; last_issue_at: string | null }[];
};

type DashboardRangeResp = {
  meta: { data_cut: string | null; timezone_day_bounds: string; logic_version: string };
  range: { date_from: string | null; date_to: string | null };
  kpis: {
    receipt_total_value: string;
    issue_total_value: string;
    receipt_txn_count: number;
    issue_txn_count: number;
    unique_batches_issued: number;
  };
  by_product: {
    es_product_code: string;
    unique_batches: number;
    total_cost: string;
    avg_cost_per_batch: string;
    issue_txn_count: number;
    first_issue_at: string | null;
    last_issue_at: string | null;
  }[];
  by_material: {
    material_code: string;
    material_name: string | null;
    uom_code: string | null;
    unique_batches: number;
    total_cost: string;
    avg_cost_per_batch: string;
    issue_qty_total: string;
    issue_txn_count: number;
    first_issue_at: string | null;
    last_issue_at: string | null;
  }[];
  monthly: MonthlyRow[];
};

type DashboardResp = DashboardLegacyResp | DashboardRangeResp;

type ProductSummary = {
  es_product_code: string;
  unique_batches: number;
  total_cost: string;
  avg_cost_per_batch: string;
};

type ProductBatchRow = {
  es_product_code: string;
  product_batch_no: string;
  batch_total_cost: string;
  issue_txn_count: number;
  first_issue_at: string;
  last_issue_at: string;
};

type BatchAnalyticsResp = {
  header: {
    es_product_code: string;
    product_batch_no: string;
    batch_total_cost: string;
    issue_txn_count: number;
    first_issue_at: string;
    last_issue_at: string;
  };
  materials: {
    stock_txn_id: number;
    created_at: string;
    created_by: string | null;
    material_code: string;
    material_name: string;
    lot_number: string;
    qty: string;
    uom_code: string;
    unit_price: string | null;
    total_value: string | null;
  }[];
};

type MaterialMonthlyRow = {
  material_code: string;
  material_name: string;
  month_bucket: string;
  issue_qty_sum: string;
  issue_value_sum: string;
  receipt_qty_sum: string;
  receipt_value_sum: string;
  issue_txn_count: number;
  receipt_txn_count: number;
};

type MaterialSummary = {
  material_code: string;
  material_name: string;
  uom_code: string | null;
  window_months: number | null;
  issue_qty_total: string;
  issue_value_total: string;
  receipt_qty_total: string;
  receipt_value_total: string;
  avg_daily_usage: string;
  lead_time_days: number | null;
  safety_factor: string;
  suggested_low_stock_threshold: string;
  calc_notes: string[];
};

type Page =
  | { kind: "dashboard" }
  | { kind: "product"; productCode: string }
  | { kind: "batch"; batchNo: string; productCode?: string }
  | { kind: "material"; materialCode: string }
  | { kind: "permission_error" };

type Crumb = { label: string; onClick: () => void; tag?: string };

function money(v: string | null | undefined) {
  if (!v) return "£0.00";
  const n = Number(v);
  if (Number.isNaN(n)) return `£${v}`;
  return n.toLocaleString(undefined, { style: "currency", currency: "GBP" });
}
function qtyFmt(v: string | null | undefined) {
  if (!v) return "0";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
function dtFmt(v: string | null | undefined) {
  if (!v) return "-";
  try {
    const d = new Date(v);
    return d.toLocaleString();
  } catch {
    return v;
  }
}

const Chip: React.FC<{ children: React.ReactNode; variant?: "blue" | "purple" | "green" | "muted" }> = ({
  children,
  variant = "muted",
}) => {
  const cls =
    variant === "blue"
      ? "analytics-chip analytics-chip-blue"
      : variant === "purple"
      ? "analytics-chip analytics-chip-purple"
      : variant === "green"
      ? "analytics-chip analytics-chip-green"
      : "analytics-chip";
  return <span className={cls}>{children}</span>;
};

type DashView = "product" | "material";
type DashSort = "most_batches" | "least_batches" | "highest_avg_cost" | "lowest_avg_cost";

function isRangeDash(d: DashboardResp | null): d is DashboardRangeResp {
  return !!d && (d as any).kpis !== undefined;
}

export const AnalyticsView: React.FC = () => {
  const [page, setPage] = useState<Page>({ kind: "dashboard" });

  // Global date range (applies to dashboard/product/material; batch unchanged)
  const [dateFrom, setDateFrom] = useState<string>(firstDayOfMonth());
  const [dateTo, setDateTo] = useState<string>(todayYmd());

  const [dashView, setDashView] = useState<DashView>("product");
  const [dashSort, setDashSort] = useState<DashSort>("most_batches");

  const [dash, setDash] = useState<DashboardResp | null>(null);
  const [productSummary, setProductSummary] = useState<ProductSummary | null>(null);
  const [productBatches, setProductBatches] = useState<ProductBatchRow[]>([]);
  const [batch, setBatch] = useState<BatchAnalyticsResp | null>(null);
  const [materialMonthly, setMaterialMonthly] = useState<MaterialMonthlyRow[]>([]);
  const [materialSummary, setMaterialSummary] = useState<MaterialSummary | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const crumbs: Crumb[] = useMemo(() => {
    const base: Crumb[] = [{ label: "Analytics", onClick: () => setPage({ kind: "dashboard" }) }];

    if (page.kind === "product") {
      base.push({ label: "Product", tag: page.productCode, onClick: () => {} });
    } else if (page.kind === "batch") {
      if (page.productCode) {
        base.push({
          label: "Product",
          tag: page.productCode,
          onClick: () => setPage({ kind: "product", productCode: page.productCode! }),
        });
      }
      base.push({ label: "Batch", tag: page.batchNo, onClick: () => {} });
    } else if (page.kind === "material") {
      base.push({ label: "Material", tag: page.materialCode, onClick: () => {} });
    }
    return base;
  }, [page]);

  function rangeQuery() {
    // Only send when on pages where range applies
    return `date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`;
  }

  async function loadDashboard() {
    setErrorMsg(null);
    const res = await apiFetch(`/analytics/dashboard?${rangeQuery()}`);
    if (res.status === 403) {
      setPage({ kind: "permission_error" });
      return;
    }
    if (!res.ok) {
      const txt = await res.text();
      setErrorMsg(`Dashboard failed: HTTP ${res.status} — ${txt}`);
      return;
    }
    const data = (await res.json()) as DashboardResp;
    setDash(data);
  }

  async function loadProduct(productCode: string) {
    setErrorMsg(null);
    const qp = rangeQuery();
    const [sRes, bRes] = await Promise.all([
      apiFetch(`/analytics/products/${encodeURIComponent(productCode)}/summary?${qp}`),
      apiFetch(`/analytics/products/${encodeURIComponent(productCode)}/batches?limit=200&offset=0&${qp}`),
    ]);
    if (sRes.status === 403 || bRes.status === 403) {
      setPage({ kind: "permission_error" });
      return;
    }
    if (!sRes.ok) return setErrorMsg(`Product summary failed: ${await sRes.text()}`);
    if (!bRes.ok) return setErrorMsg(`Product batches failed: ${await bRes.text()}`);
    setProductSummary((await sRes.json()) as ProductSummary);
    setProductBatches((await bRes.json()) as ProductBatchRow[]);
  }

  async function loadBatch(batchNo: string) {
    // Batch analytics is NOT date-filtered by design
    setErrorMsg(null);
    const res = await apiFetch(`/analytics/batches/${encodeURIComponent(batchNo)}`);
    if (res.status === 403) {
      setPage({ kind: "permission_error" });
      return;
    }
    if (!res.ok) return setErrorMsg(`Batch failed: ${await res.text()}`);
    setBatch((await res.json()) as BatchAnalyticsResp);
  }

  async function loadMaterial(materialCode: string) {
    setErrorMsg(null);
    const qp = rangeQuery();
    const [mRes, sRes] = await Promise.all([
      apiFetch(`/analytics/materials/${encodeURIComponent(materialCode)}/monthly?${qp}`),
      apiFetch(`/analytics/materials/${encodeURIComponent(materialCode)}/summary?window_months=6&safety_factor=1.25&${qp}`),
    ]);
    if (mRes.status === 403 || sRes.status === 403) {
      setPage({ kind: "permission_error" });
      return;
    }
    if (!mRes.ok) return setErrorMsg(`Material monthly failed: ${await mRes.text()}`);
    if (!sRes.ok) return setErrorMsg(`Material summary failed: ${await sRes.text()}`);
    setMaterialMonthly((await mRes.json()) as MaterialMonthlyRow[]);
    setMaterialSummary((await sRes.json()) as MaterialSummary);
  }

  // Initial load
  useEffect(() => {
    loadDashboard().catch((e) => setErrorMsg(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Page changes
  useEffect(() => {
    (async () => {
      if (page.kind === "product") await loadProduct(page.productCode);
      if (page.kind === "batch") await loadBatch(page.batchNo);
      if (page.kind === "material") await loadMaterial(page.materialCode);
      if (page.kind === "dashboard") await loadDashboard();
    })().catch((e) => setErrorMsg(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.kind, (page as any).productCode, (page as any).batchNo, (page as any).materialCode]);

  // Date range changes: reload dashboard/product/material; batch unchanged
  useEffect(() => {
    (async () => {
      if (page.kind === "dashboard") await loadDashboard();
      if (page.kind === "product") await loadProduct(page.productCode);
      if (page.kind === "material") await loadMaterial(page.materialCode);
    })().catch((e) => setErrorMsg(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  function pickSearch(r: SearchResult) {
    if (r.entity_type === "product") setPage({ kind: "product", productCode: r.key });
    if (r.entity_type === "batch") setPage({ kind: "batch", batchNo: r.key });
    if (r.entity_type === "material") setPage({ kind: "material", materialCode: r.key });
  }

  const dashList = useMemo(() => {
    if (!dash || !isRangeDash(dash)) return [];
    if (dashView === "product") {
      const arr = [...dash.by_product].filter((x) => x.es_product_code);
      arr.sort((a, b) => {
        if (dashSort === "most_batches") return (b.unique_batches ?? 0) - (a.unique_batches ?? 0);
        if (dashSort === "least_batches") return (a.unique_batches ?? 0) - (b.unique_batches ?? 0);
        if (dashSort === "highest_avg_cost") return Number(b.avg_cost_per_batch) - Number(a.avg_cost_per_batch);
        if (dashSort === "lowest_avg_cost") return Number(a.avg_cost_per_batch) - Number(b.avg_cost_per_batch);
        return 0;
      });
      return arr.map((x) => ({
        key: x.es_product_code,
        title: x.es_product_code,
        subtitle: x.last_issue_at ? `Last manufactured: ${dtFmt(x.last_issue_at)}` : "",
        batches: x.unique_batches,
        avgCost: x.avg_cost_per_batch,
        kind: "product" as const,
      }));
    }

    const arr = [...dash.by_material].filter((x) => x.material_code);
    arr.sort((a, b) => {
      if (dashSort === "most_batches") return (b.unique_batches ?? 0) - (a.unique_batches ?? 0);
      if (dashSort === "least_batches") return (a.unique_batches ?? 0) - (b.unique_batches ?? 0);
      if (dashSort === "highest_avg_cost") return Number(b.avg_cost_per_batch) - Number(a.avg_cost_per_batch);
      if (dashSort === "lowest_avg_cost") return Number(a.avg_cost_per_batch) - Number(b.avg_cost_per_batch);
      return 0;
    });
    return arr.map((x) => ({
      key: x.material_code,
      title: x.material_code,
      subtitle: x.material_name || "",
      batches: x.unique_batches,
      avgCost: x.avg_cost_per_batch,
      kind: "material" as const,
    }));
  }, [dash, dashView, dashSort]);

  function exportDashboardCsv() {
    if (!dash || !isRangeDash(dash)) return;

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

    const rows: any[][] = [];

    rows.push([
      dateFrom,
      dateTo,
      dash.kpis.receipt_total_value,
      dash.kpis.issue_total_value,
      dash.kpis.unique_batches_issued,
      dashView,
      "",
      "",
      "",
      "",
      "",
    ]);

    if (dashView === "product") {
      for (const p of dash.by_product) {
        rows.push([
          dateFrom,
          dateTo,
          dash.kpis.receipt_total_value,
          dash.kpis.issue_total_value,
          dash.kpis.unique_batches_issued,
          "product",
          p.es_product_code,
          "",
          p.unique_batches,
          p.avg_cost_per_batch,
          p.total_cost,
        ]);
      }
    } else {
      for (const m of dash.by_material) {
        rows.push([
          dateFrom,
          dateTo,
          dash.kpis.receipt_total_value,
          dash.kpis.issue_total_value,
          dash.kpis.unique_batches_issued,
          "material",
          m.material_code,
          m.material_name || "",
          m.unique_batches,
          m.avg_cost_per_batch,
          m.total_cost,
        ]);
      }
    }

    const csv = buildCsv(headers, rows);
    downloadCsv(`analytics_dashboard_${dashView}_${dateFrom}_to_${dateTo}.csv`, csv);
  }

  function exportProductCsv() {
    if (!productSummary) return;
    const headers = ["date_from", "date_to", "product_code", "unique_batches", "total_cost", "avg_cost_per_batch", "batch_no", "batch_total_cost", "issue_txn_count", "last_issue_at"];
    const rows: any[][] = [];

    rows.push([
      dateFrom,
      dateTo,
      productSummary.es_product_code,
      productSummary.unique_batches,
      productSummary.total_cost,
      productSummary.avg_cost_per_batch,
      "",
      "",
      "",
      "",
    ]);

    for (const b of productBatches) {
      rows.push([
        dateFrom,
        dateTo,
        productSummary.es_product_code,
        productSummary.unique_batches,
        productSummary.total_cost,
        productSummary.avg_cost_per_batch,
        b.product_batch_no,
        b.batch_total_cost,
        b.issue_txn_count,
        b.last_issue_at,
      ]);
    }

    const csv = buildCsv(headers, rows);
    downloadCsv(`analytics_product_${productSummary.es_product_code}_${dateFrom}_to_${dateTo}.csv`, csv);
  }

  function exportMaterialCsv() {
    if (!materialSummary) return;
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
      materialSummary.material_code,
      materialSummary.material_name,
      materialSummary.issue_qty_total,
      materialSummary.issue_value_total,
      materialSummary.receipt_qty_total,
      materialSummary.receipt_value_total,
      materialSummary.avg_daily_usage,
      "",
      "",
      "",
      "",
      "",
    ]);

    for (const r of materialMonthly) {
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

    const csv = buildCsv(headers, rows);
    downloadCsv(`analytics_material_${materialSummary.material_code}_${dateFrom}_to_${dateTo}.csv`, csv);
  }

  return (
    <section className="content">
      <div className="analytics-topbar">
        <div className="analytics-crumbs">
          {crumbs.map((c, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 ? <span className="analytics-sep">›</span> : null}
              <button className="analytics-crumb" onClick={c.onClick}>
                <span>{c.label}</span>
                {c.tag ? <span className="analytics-tag mono">{c.tag}</span> : null}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="analytics-actions">
          <div className="chip">
            <span className="chip-dot" />
            Traceable
          </div>
          <button className="btn-secondary" onClick={() => setSearchOpen(true)}>
            🔎 Search / Explore
          </button>
        </div>
      </div>

      {/* Global date range (does NOT apply to Batch page) */}
      {page.kind !== "batch" && page.kind !== "permission_error" ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="rowline" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="card-title">Date range</div>
              <div className="card-subtitle">Applies to Dashboard / Product / Material analytics (Batch is snapshot and unfiltered).</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="muted">From</span>
                <input className="analytics-input" style={{ width: 170 }} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="muted">To</span>
                <input className="analytics-input" style={{ width: 170 }} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {page.kind === "permission_error" ? (
        <div className="card">
          <div className="card-title">Analytics permission required</div>
          <div className="card-subtitle" style={{ marginTop: 6 }}>
            Your role is missing <span className="mono">analytics.view</span>.
          </div>
        </div>
      ) : null}

      {errorMsg ? (
        <div className="card">
          <div className="card-title">Analytics error</div>
          <div className="card-subtitle" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
            {errorMsg}
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn-primary" onClick={() => setPage({ kind: "dashboard" })}>
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {/* DASHBOARD */}
      {page.kind === "dashboard" && dash && isRangeDash(dash) ? (
        <div className="card">
          <div className="card-header">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <div className="card-title">Analytics Dashboard</div>
                <div className="card-subtitle">
                  Filtered totals from <span className="mono">stock_transactions</span> (no historical recalculation).
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn-secondary" onClick={exportDashboardCsv}>
                  ⬇ CSV Export
                </button>

                <select className="analytics-input" style={{ width: 190 }} value={dashView} onChange={(e) => setDashView(e.target.value as DashView)}>
                  <option value="product">ES Product view</option>
                  <option value="material">Material view</option>
                </select>

                <select className="analytics-input" style={{ width: 240 }} value={dashSort} onChange={(e) => setDashSort(e.target.value as DashSort)}>
                  <option value="most_batches">Most → least manufactured</option>
                  <option value="least_batches">Least → most manufactured</option>
                  <option value="highest_avg_cost">Highest → lowest avg cost/batch</option>
                  <option value="lowest_avg_cost">Lowest → highest avg cost/batch</option>
                </select>
              </div>
            </div>
          </div>

          <div className="metrics-row analytics-metrics">
            <div className="metric-card">
              <div className="metric-label">Total spend (Receipts)</div>
              <div className="metric-value">{money(dash.kpis.receipt_total_value)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Total consumption cost (Issues)</div>
              <div className="metric-value">{money(dash.kpis.issue_total_value)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Unique ES batches (range)</div>
              <div className="metric-value">{dash.kpis.unique_batches_issued ?? 0}</div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="rowline">
              <Chip variant={dashView === "product" ? "blue" : "green"}>
                {dashView === "product" ? "Products manufactured (filtered)" : "Materials used (filtered)"}
              </Chip>
              <span className="muted">Shows all entities in the selected date range.</span>
            </div>

            <table className="analytics-table" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>{dashView === "product" ? "Product code" : "Material code"}</th>
                  <th>{dashView === "product" ? "Unique batches" : "Unique batches fed into"}</th>
                  <th>Avg cost per batch</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dashList.map((x) => (
                  <tr key={x.key}>
                    <td>
                      <button
                        className="link mono"
                        onClick={() => {
                          if (x.kind === "product") setPage({ kind: "product", productCode: x.key });
                          if (x.kind === "material") setPage({ kind: "material", materialCode: x.key });
                        }}
                      >
                        {x.title}
                      </button>
                      {x.subtitle ? <div className="muted">{x.subtitle}</div> : null}
                    </td>
                    <td className="mono">{x.batches}</td>
                    <td className="mono">{money(x.avgCost)}</td>
                    <td>
                      <button
                        className="btn-mini"
                        onClick={() => {
                          if (x.kind === "product") setPage({ kind: "product", productCode: x.key });
                          if (x.kind === "material") setPage({ kind: "material", materialCode: x.key });
                        }}
                      >
                        Open →
                      </button>
                    </td>
                  </tr>
                ))}
                {dashList.length === 0 ? (
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
      ) : null}

      {/* PRODUCT */}
      {page.kind === "product" ? (
        <div className="card">
          <div className="card-header">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <div className="card-title">
                  Product Analytics <Chip variant="blue">{page.productCode}</Chip>
                </div>
                <div className="card-subtitle">Date range filtered. Click a batch to drill down (batch page is snapshot).</div>
              </div>

              <button className="btn-secondary" onClick={exportProductCsv} disabled={!productSummary}>
                ⬇ CSV Export
              </button>
            </div>
          </div>

          <div className="metrics-row analytics-metrics">
            <div className="metric-card">
              <div className="metric-label">Batches manufactured</div>
              <div className="metric-value">{productSummary?.unique_batches ?? "-"}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Total material cost</div>
              <div className="metric-value">{money(productSummary?.total_cost)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Average cost per batch</div>
              <div className="metric-value">{money(productSummary?.avg_cost_per_batch)}</div>
            </div>
          </div>

          <table className="analytics-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>ES batch no</th>
                <th>Total batch material cost</th>
                <th>Issue txn rows</th>
                <th>Last issue</th>
              </tr>
            </thead>
            <tbody>
              {productBatches.map((b) => (
                <tr key={b.product_batch_no}>
                  <td>
                    <button className="link mono" onClick={() => setPage({ kind: "batch", batchNo: b.product_batch_no, productCode: page.productCode })}>
                      {b.product_batch_no}
                    </button>
                  </td>
                  <td className="mono">{money(b.batch_total_cost)}</td>
                  <td className="mono muted">{b.issue_txn_count}</td>
                  <td className="mono muted">{dtFmt(b.last_issue_at)}</td>
                </tr>
              ))}
              {productBatches.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No batches found for this product code in the selected date range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* BATCH (unchanged: no date range) */}
      {page.kind === "batch" ? (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                Batch Analytics <Chip variant="purple">{page.batchNo}</Chip>
              </div>
              <div className="card-subtitle">Materials are the ISSUE rows for this batch (snapshot costs).</div>
            </div>
          </div>

          <div className="metrics-row analytics-metrics">
            <div className="metric-card">
              <div className="metric-label">Batch total cost</div>
              <div className="metric-value">{money(batch?.header.batch_total_cost)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Issue rows</div>
              <div className="metric-value">{batch?.header.issue_txn_count ?? "-"}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Product code</div>
              <div className="metric-value mono">{batch?.header.es_product_code ?? "-"}</div>
            </div>
          </div>

          <table className="analytics-table" style={{ marginTop: 12 }}>
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
                    <button className="link mono" onClick={() => setPage({ kind: "material", materialCode: m.material_code })}>
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
      ) : null}

      {/* MATERIAL */}
      {page.kind === "material" ? (
        <div className="card">
          <div className="card-header">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <div className="card-title">
                  Material Analytics <Chip variant="green">{page.materialCode}</Chip>
                </div>
                <div className="card-subtitle">Date range filtered totals + monthly breakdown.</div>
              </div>

              <button className="btn-secondary" onClick={exportMaterialCsv} disabled={!materialSummary}>
                ⬇ CSV Export
              </button>
            </div>
          </div>

          <div className="metrics-row analytics-metrics">
            <div className="metric-card">
              <div className="metric-label">Usage (issues)</div>
              <div className="metric-value">{qtyFmt(materialSummary?.issue_qty_total)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Spend (receipts)</div>
              <div className="metric-value">{money(materialSummary?.receipt_value_total)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Suggested low-stock (advisory)</div>
              <div className="metric-value">{qtyFmt(materialSummary?.suggested_low_stock_threshold)}</div>
            </div>
          </div>

          <table className="analytics-table" style={{ marginTop: 12 }}>
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
              {materialMonthly.map((r) => (
                <tr key={r.month_bucket}>
                  <td className="mono">{r.month_bucket}</td>
                  <td className="mono">{qtyFmt(r.issue_qty_sum)}</td>
                  <td className="mono">{money(r.issue_value_sum)}</td>
                  <td className="mono">{qtyFmt(r.receipt_qty_sum)}</td>
                  <td className="mono">{money(r.receipt_value_sum)}</td>
                </tr>
              ))}
              {materialMonthly.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No monthly data for this material in the selected date range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <div className="analytics-note" style={{ marginTop: 12 }}>
            <strong>Calculation notes</strong>
            <ul className="analytics-notes-list">
              {(materialSummary?.calc_notes || []).map((n, i) => (
                <li key={i} className="muted">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onPick={pickSearch} />
    </section>
  );
};

export default AnalyticsView;
