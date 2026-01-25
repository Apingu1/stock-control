import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api";

type MonthlyRow = {
  month_bucket: string;
  receipt_total_value: string;
  issue_total_value: string;
  receipt_txn_count: number;
  issue_txn_count: number;
  unique_batches_issued: number;
};

type DashboardResp = {
  meta: { data_cut: string | null; timezone_month_bucket: string; logic_version: string };
  monthly: MonthlyRow[];
  top_products: { es_product_code: string; unique_batch_count: number; last_issue_at: string | null }[];
};

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
  window_months: number;
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

type SearchResult = {
  entity_type: "material" | "lot" | "product" | "batch";
  key: string;
  label: string;
  sublabel?: string | null;
};

type Page =
  | { kind: "dashboard" }
  | { kind: "product"; productCode: string }
  | { kind: "batch"; batchNo: string; productCode?: string }
  | { kind: "material"; materialCode: string }
  | { kind: "permission_error" };

type Crumb = {
  label: string;
  onClick: () => void;
  tag?: string;
};

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

const SearchModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onPick: (r: SearchResult) => void;
}> = ({ open, onClose, onPick }) => {
  const [searchType, setSearchType] = useState<
    "material_code" | "material_name" | "lot_number" | "product_code" | "batch_no"
  >("material_code");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);

  async function run() {
    const qq = q.trim();
    if (!qq) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(
        `/analytics/search?search_type=${encodeURIComponent(searchType)}&q=${encodeURIComponent(qq)}&limit=15`
      );
      if (res.status === 403) {
        setResults([]);
        return;
      }
      const data = (await res.json()) as SearchResult[];
      setResults(data || []);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => run(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, searchType, open]);

  if (!open) return null;

  return (
    <div className="analytics-overlay" onClick={onClose}>
      <div className="analytics-modal card" onClick={(e) => e.stopPropagation()}>
        <div className="analytics-modal-head">
          <div>
            <div className="card-title">Search / Explore</div>
            <div className="card-subtitle">Drill into Product → Batch → Material with reconcilable numbers.</div>
          </div>
          <button className="btn-secondary" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="analytics-modal-body">
          <div className="analytics-modal-left">
            <label className="analytics-label">Search type</label>
            <select className="analytics-input" value={searchType} onChange={(e) => setSearchType(e.target.value as any)}>
              <option value="material_code">By Material Code</option>
              <option value="material_name">By Material Name</option>
              <option value="lot_number">By Lot Number</option>
              <option value="product_code">By Product Code (e.g. DULO2)</option>
              <option value="batch_no">By ES Batch Number</option>
            </select>

            <label className="analytics-label" style={{ marginTop: 12 }}>
              Query
            </label>
            <input
              className="analytics-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. SORB-001 / Sorbitol / LOT-24-1187 / DULO2 / ES000287"
              autoFocus
            />
          </div>

          <div className="analytics-modal-right">
            <div className="analytics-results-head">
              <div className="rowline">
                <Chip variant="purple">Results</Chip>
                <span className="muted">Click to open analytics</span>
              </div>
              <span className="mono">{busy ? "Searching…" : `${results.length} result(s)`}</span>
            </div>

            <div className="analytics-results-list">
              {results.map((r) => (
                <button
                  key={`${r.entity_type}:${r.key}`}
                  className="analytics-result-item"
                  onClick={() => {
                    onPick(r);
                    onClose();
                  }}
                >
                  <div className="analytics-result-left">
                    <div className="analytics-result-title">
                      <span className="mono">{r.label}</span>{" "}
                      <Chip variant={r.entity_type === "product" ? "blue" : r.entity_type === "batch" ? "purple" : "green"}>
                        {r.entity_type.toUpperCase()}
                      </Chip>
                    </div>
                    <div className="analytics-result-sub">{r.sublabel || ""}</div>
                  </div>
                  <div className="analytics-result-right">Open →</div>
                </button>
              ))}
              {results.length === 0 && !busy ? <div className="analytics-empty">No results</div> : null}
            </div>
          </div>
        </div>

        <div className="analytics-modal-foot">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" onClick={() => run()} disabled={busy}>
            🔎 Search
          </button>
        </div>
      </div>
    </div>
  );
};

export const AnalyticsView: React.FC = () => {
  const [page, setPage] = useState<Page>({ kind: "dashboard" });

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
        base.push({ label: "Product", tag: page.productCode, onClick: () => setPage({ kind: "product", productCode: page.productCode! }) });
      }
      base.push({ label: "Batch", tag: page.batchNo, onClick: () => {} });
    } else if (page.kind === "material") {
      base.push({ label: "Material", tag: page.materialCode, onClick: () => {} });
    }
    return base;
  }, [page]);

  async function loadDashboard() {
    setErrorMsg(null);
    const res = await apiFetch(`/analytics/dashboard?top_n=10`);
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
    const [sRes, bRes] = await Promise.all([
      apiFetch(`/analytics/products/${encodeURIComponent(productCode)}/summary`),
      apiFetch(`/analytics/products/${encodeURIComponent(productCode)}/batches?limit=200&offset=0`),
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
    const [mRes, sRes] = await Promise.all([
      apiFetch(`/analytics/materials/${encodeURIComponent(materialCode)}/monthly`),
      apiFetch(`/analytics/materials/${encodeURIComponent(materialCode)}/summary?window_months=6&safety_factor=1.25`),
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

  useEffect(() => {
    loadDashboard().catch((e) => setErrorMsg(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (page.kind === "product") await loadProduct(page.productCode);
      if (page.kind === "batch") await loadBatch(page.batchNo);
      if (page.kind === "material") await loadMaterial(page.materialCode);
      if (page.kind === "dashboard") await loadDashboard();
    })().catch((e) => setErrorMsg(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.kind, (page as any).productCode, (page as any).batchNo, (page as any).materialCode]);

  function pickSearch(r: SearchResult) {
    if (r.entity_type === "product") setPage({ kind: "product", productCode: r.key });
    if (r.entity_type === "batch") setPage({ kind: "batch", batchNo: r.key });
    if (r.entity_type === "material") setPage({ kind: "material", materialCode: r.key });
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

      {page.kind === "dashboard" && dash ? (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Analytics Dashboard</div>
              <div className="card-subtitle">
                Monthly KPIs grouped by calendar month • source: <span className="mono">stock_transactions</span>
              </div>
            </div>
          </div>

          <div className="metrics-row analytics-metrics">
            <div className="metric-card">
              <div className="metric-label">This month spend (Receipts)</div>
              <div className="metric-value">{money(dash.monthly.at(-1)?.receipt_total_value)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">This month consumption cost (Issues)</div>
              <div className="metric-value">{money(dash.monthly.at(-1)?.issue_total_value)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Unique batches manufactured (month)</div>
              <div className="metric-value">{dash.monthly.at(-1)?.unique_batches_issued ?? 0}</div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="rowline">
              <Chip variant="blue">Commonly manufactured products</Chip>
              <span className="muted">count(distinct ES batch numbers) per product code</span>
            </div>

            <table className="analytics-table" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Product code</th>
                  <th>Unique batches</th>
                  <th>Last manufactured</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dash.top_products.map((p) => (
                  <tr key={p.es_product_code}>
                    <td>
                      <button className="link mono" onClick={() => setPage({ kind: "product", productCode: p.es_product_code })}>
                        {p.es_product_code}
                      </button>
                    </td>
                    <td className="mono">{p.unique_batch_count}</td>
                    <td className="mono muted">{p.last_issue_at ? dtFmt(p.last_issue_at) : "-"}</td>
                    <td>
                      <button className="btn-mini" onClick={() => setPage({ kind: "product", productCode: p.es_product_code })}>
                        Open →
                      </button>
                    </td>
                  </tr>
                ))}
                {dash.top_products.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No products found (issues history empty)
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {page.kind === "product" ? (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                Product Analytics <Chip variant="blue">{page.productCode}</Chip>
              </div>
              <div className="card-subtitle">Click a batch to drill down.</div>
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
                    No batches found for this product code.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

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

      {page.kind === "material" ? (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                Material Analytics <Chip variant="green">{page.materialCode}</Chip>
              </div>
              <div className="card-subtitle">Monthly usage/spend + advisory low-stock suggestion (explainable).</div>
            </div>
          </div>

          <div className="metrics-row analytics-metrics">
            <div className="metric-card">
              <div className="metric-label">Usage (issues) • 6 months</div>
              <div className="metric-value">{qtyFmt(materialSummary?.issue_qty_total)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Spend (receipts) • 6 months</div>
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
                    No monthly data for this material yet.
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
