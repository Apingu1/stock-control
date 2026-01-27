import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api";
import { SearchModal } from "./SearchModal";
import type { SearchResult } from "./SearchModal";
import { firstDayOfMonth, todayYmd } from "./csv";

import type {
  DashSort,
  DashView,
  DashboardResp,
  ProductSummary,
  ProductBatchRow,
  BatchAnalyticsResp,
  MaterialMonthlyRow,
  MaterialSummary,
} from "./analyticsShared";

import { DashboardPanel } from "./DashboardPanel";
import { ProductPanel } from "./ProductPanel";
import { BatchPanel } from "./BatchPanel";
import { MaterialPanel } from "./MaterialPanel";

type Page =
  | { kind: "dashboard" }
  | { kind: "product"; productCode: string }
  | { kind: "batch"; batchNo: string; productCode?: string }
  | { kind: "material"; materialCode: string }
  | { kind: "permission_error" };

type Crumb = { label: string; onClick: () => void; tag?: string };

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

  // Phase 3B
  const [materialLotFilter, setMaterialLotFilter] = useState<string>("");
  const [materialLots, setMaterialLots] = useState<MaterialLotRow[]>([]);
  const [materialTrace, setMaterialTrace] = useState<MaterialTraceRow[]>([]);

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
    return `date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`;
  }

  async function loadDashboard() {
    setErrorMsg(null);
    const res = await apiFetch(`/analytics/dashboard?${rangeQuery()}`);
    if (res.status === 403) return setPage({ kind: "permission_error" });
    if (!res.ok) return setErrorMsg(`Dashboard failed: HTTP ${res.status} — ${await res.text()}`);
    setDash((await res.json()) as DashboardResp);
  }

  async function loadProduct(productCode: string) {
    setErrorMsg(null);
    const qp = rangeQuery();
    const [sRes, bRes] = await Promise.all([
      apiFetch(`/analytics/products/${encodeURIComponent(productCode)}/summary?${qp}`),
      apiFetch(`/analytics/products/${encodeURIComponent(productCode)}/batches?limit=200&offset=0&${qp}`),
    ]);
    if (sRes.status === 403 || bRes.status === 403) return setPage({ kind: "permission_error" });
    if (!sRes.ok) return setErrorMsg(`Product summary failed: ${await sRes.text()}`);
    if (!bRes.ok) return setErrorMsg(`Product batches failed: ${await bRes.text()}`);
    setProductSummary((await sRes.json()) as ProductSummary);
    setProductBatches((await bRes.json()) as ProductBatchRow[]);
  }

  async function loadBatch(batchNo: string) {
    // Batch analytics is NOT date-filtered by design
    setErrorMsg(null);
    const res = await apiFetch(`/analytics/batches/${encodeURIComponent(batchNo)}`);
    if (res.status === 403) return setPage({ kind: "permission_error" });
    if (!res.ok) return setErrorMsg(`Batch failed: ${await res.text()}`);
    setBatch((await res.json()) as BatchAnalyticsResp);
  }

  async function loadMaterial(materialCode: string) {
    setErrorMsg(null);
    const qp = rangeQuery();

    const lotQ = materialLotFilter?.trim()
      ? `&lot_number=${encodeURIComponent(materialLotFilter.trim())}`
      : "";

    const [mRes, sRes, lotsRes, traceRes] = await Promise.all([
      apiFetch(`/analytics/materials/${encodeURIComponent(materialCode)}/monthly?${qp}`),
      apiFetch(`/analytics/materials/${encodeURIComponent(materialCode)}/summary?window_months=6&safety_factor=1.25&${qp}`),
      apiFetch(`/analytics/materials/${encodeURIComponent(materialCode)}/lots?${qp}${lotQ}`),
      apiFetch(`/analytics/materials/${encodeURIComponent(materialCode)}/traceability?${qp}${lotQ}`),
    ]);

    if (mRes.status === 403 || sRes.status === 403 || lotsRes.status === 403 || traceRes.status === 403) {
      return setPage({ kind: "permission_error" });
    }

    if (!mRes.ok) return setErrorMsg(`Material monthly failed: ${await mRes.text()}`);
    if (!sRes.ok) return setErrorMsg(`Material summary failed: ${await sRes.text()}`);
    if (!lotsRes.ok) return setErrorMsg(`Material lots failed: ${await lotsRes.text()}`);
    if (!traceRes.ok) return setErrorMsg(`Material traceability failed: ${await traceRes.text()}`);

    setMaterialMonthly((await mRes.json()) as MaterialMonthlyRow[]);
    setMaterialSummary((await sRes.json()) as MaterialSummary);

    setMaterialLots((await lotsRes.json()) as MaterialLotRow[]);
    setMaterialTrace((await traceRes.json()) as MaterialTraceRow[]);
  }

  // initial
  useEffect(() => {
    loadDashboard().catch((e) => setErrorMsg(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // page changes
  useEffect(() => {
    (async () => {
      if (page.kind === "dashboard") await loadDashboard();
      if (page.kind === "product") await loadProduct(page.productCode);
      if (page.kind === "batch") await loadBatch(page.batchNo);
      if (page.kind === "material") await loadMaterial(page.materialCode);
    })().catch((e) => setErrorMsg(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.kind, (page as any).productCode, (page as any).batchNo, (page as any).materialCode]);

  // date range changes: reload only pages where range applies
  useEffect(() => {
    (async () => {
      if (page.kind === "dashboard") await loadDashboard();
      if (page.kind === "product") await loadProduct(page.productCode);
      if (page.kind === "material") await loadMaterial(page.materialCode);
    })().catch((e) => setErrorMsg(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  // Phase 3B: lot filter changes only affect material page
  useEffect(() => {
    (async () => {
      if (page.kind === "material") await loadMaterial(page.materialCode);
    })().catch((e) => setErrorMsg(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialLotFilter]);

  function pickSearch(r: SearchResult) {
    if (r.entity_type === "product") setPage({ kind: "product", productCode: r.key });
    if (r.entity_type === "batch") setPage({ kind: "batch", batchNo: r.key });
    if (r.entity_type === "material") setPage({ kind: "material", materialCode: r.key });
  }

  const showDateBar = page.kind !== "batch" && page.kind !== "permission_error";

  return (
    <section className="content analytics-shell">
      {/* Command bar */}
      <div className="analytics-commandbar">
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

        <div className="analytics-command-actions">
          <div className="chip">
            <span className="chip-dot" />
            Traceable
          </div>
          <button className="btn-secondary" onClick={() => setSearchOpen(true)}>
            🔎 Search / Explore
          </button>
        </div>
      </div>

      {/* Global date range */}
      {showDateBar ? (
        <div className="card analytics-card analytics-datebar">
          <div className="rowline" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="card-title">Date range</div>
              <div className="card-subtitle">
                Applies to Dashboard / Product / Material analytics (Batch is snapshot and unfiltered).
              </div>
            </div>
            <div className="analytics-datecontrols">
              <div className="analytics-dategroup">
                <span className="muted">From</span>
                <input
                  className="analytics-input"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="analytics-dategroup">
                <span className="muted">To</span>
                <input
                  className="analytics-input"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {page.kind === "permission_error" ? (
        <div className="card analytics-card">
          <div className="card-title">Analytics permission required</div>
          <div className="card-subtitle" style={{ marginTop: 6 }}>
            Your role is missing <span className="mono">analytics.view</span>.
          </div>
        </div>
      ) : null}

      {errorMsg ? (
        <div className="card analytics-card">
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

      {/* Panels */}
      {page.kind === "dashboard" ? (
        <DashboardPanel
          dash={dash}
          dateFrom={dateFrom}
          dateTo={dateTo}
          dashView={dashView}
          dashSort={dashSort}
          setDashView={setDashView}
          setDashSort={setDashSort}
          onOpenProduct={(code) => setPage({ kind: "product", productCode: code })}
          onOpenMaterial={(code) => setPage({ kind: "material", materialCode: code })}
        />
      ) : null}

      {page.kind === "product" ? (
        <ProductPanel
          productCode={page.productCode}
          dateFrom={dateFrom}
          dateTo={dateTo}
          summary={productSummary}
          batches={productBatches}
          onOpenBatch={(batchNo) => setPage({ kind: "batch", batchNo, productCode: page.productCode })}
        />
      ) : null}

      {page.kind === "batch" ? (
        <BatchPanel
          batchNo={page.batchNo}
          batch={batch}
          onOpenMaterial={(materialCode) => setPage({ kind: "material", materialCode })}
        />
      ) : null}

      {page.kind === "material" ? (
        <MaterialPanel
          materialCode={page.materialCode}
          dateFrom={dateFrom}
          dateTo={dateTo}
          summary={materialSummary}
          monthly={materialMonthly}
          lots={materialLots}
          trace={materialTrace}
          lotFilter={materialLotFilter}
          setLotFilter={setMaterialLotFilter}
        />
      ) : null}

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onPick={pickSearch} />
    </section>
  );
};

export default AnalyticsView;
