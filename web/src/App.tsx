// src/App.tsx
import React, { useEffect, useState } from "react";
import type {
  LotBalance,
  Material,
  ViewMode,
  Receipt,
  Issue,
} from "./types";
import { apiFetch } from "./utils/api";

import DashboardView from "./components/dashboard/DashboardView";
import MaterialsLibraryView from "./components/materials/MaterialsLibraryView";
import GoodsReceiptsView from "./components/receipts/GoodsReceiptsView";
import ConsumptionView from "./components/issues/ConsumptionView";
import LiveLotsView from "./components/lots/LiveLotsView";

import NewReceiptModal from "./components/modals/NewReceiptModal";
import IssueModal from "./components/modals/IssueModal";
import MaterialModal from "./components/modals/MaterialModal";

const App: React.FC = () => {
  const [lotBalances, setLotBalances] = useState<LotBalance[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);

  // Loading / error flags
  const [loadingLots, setLoadingLots] = useState(true);
  const [lotsError, setLotsError] = useState<string | null>(null);

  const [loadingReceipts, setLoadingReceipts] = useState(true);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);

  const [loadingIssues, setLoadingIssues] = useState(true);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  // Modals
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showNewMaterialModal, setShowNewMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(
    null
  );

  const [view, setView] = useState<ViewMode>("dashboard");

  // --- Data loaders ----------------------------------------------------------

  const loadLotBalances = async () => {
    try {
      setLoadingLots(true);
      setLotsError(null);
      const res = await apiFetch("/lot-balances/");
      const data = (await res.json()) as LotBalance[];
      setLotBalances(data);
    } catch (e: any) {
      console.error(e);
      setLotsError(e?.message ?? "Failed to load lot balances");
    } finally {
      setLoadingLots(false);
    }
  };

  const loadMaterials = async () => {
    try {
      const res = await apiFetch("/materials/?limit=500");
      const data = (await res.json()) as Material[];
      setMaterials(data);
    } catch (e) {
      console.error("Failed to load materials", e);
    }
  };

  const loadReceipts = async () => {
    try {
      setLoadingReceipts(true);
      setReceiptsError(null);
      const res = await apiFetch("/receipts/?limit=500");
      const data = (await res.json()) as Receipt[];
      setReceipts(data);
    } catch (e: any) {
      console.error("Failed to load receipts", e);
      setReceipts([]);
      setReceiptsError(e?.message ?? "Failed to load receipts");
    } finally {
      setLoadingReceipts(false);
    }
  };

  const loadIssues = async () => {
    try {
      setLoadingIssues(true);
      setIssuesError(null);
      const res = await apiFetch("/issues/?limit=500");
      const data = (await res.json()) as Issue[];
      setIssues(data);
    } catch (e: any) {
      console.error("Failed to load issues", e);
      setIssues([]);
      setIssuesError(e?.message ?? "Failed to load issues");
    } finally {
      setLoadingIssues(false);
    }
  };

  useEffect(() => {
    void loadLotBalances();
    void loadMaterials();
    void loadReceipts();
    void loadIssues();
  }, []);

  const handleMaterialSaved = async () => {
    await loadMaterials();
  };

  const handleReceiptPosted = async () => {
    await Promise.all([loadLotBalances(), loadReceipts()]);
  };

  const handleIssuePosted = async () => {
    await Promise.all([loadLotBalances(), loadIssues()]);
  };

  // --- Render ---------------------------------------------------------------

  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">SC</div>
          <div>
            <div className="sidebar-title-main">Digital Stock</div>
            <div className="sidebar-title-sub">Control Studio</div>
          </div>
        </div>

        <div className="sidebar-section-label">Workspace</div>
        <ul className="nav-list">
          <li className="nav-item">
            <button
              type="button"
              className={
                "nav-link as-button " +
                (view === "dashboard" ? "active" : "")
              }
              onClick={() => setView("dashboard")}
            >
              <span className="icon">📊</span>
              Dashboard
              <span className="badge">Today</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={
                "nav-link as-button " +
                (view === "materials" ? "active" : "")
              }
              onClick={() => setView("materials")}
            >
              <span className="icon">🧪</span>
              Materials Library
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={
                "nav-link as-button " +
                (view === "receipts" ? "active" : "")
              }
              onClick={() => setView("receipts")}
            >
              <span className="icon">📥</span>
              Goods Receipts
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={
                "nav-link as-button " + (view === "issues" ? "active" : "")
              }
              onClick={() => setView("issues")}
            >
              <span className="icon">🚚</span>
              Consumption
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={
                "nav-link as-button " + (view === "lots" ? "active" : "")
              }
              onClick={() => setView("lots")}
            >
              <span className="icon">📦</span>
              Live Lots
            </button>
          </li>
        </ul>

        <div className="sidebar-section-label">Risk &amp; Quality</div>
        <ul className="nav-list">
          <li className="nav-item">
            <a href="#" className="nav-link">
              <span className="icon">⏰</span>
              Expiry Watchlist
              <span className="badge">12</span>
            </a>
          </li>
          <li className="nav-item">
            <a href="#" className="nav-link">
              <span className="icon">📦</span>
              Quarantine
              <span className="badge">4</span>
            </a>
          </li>
          <li className="nav-item">
            <a href="#" className="nav-link">
              <span className="icon">📑</span>
              Audit Trail
            </a>
          </li>
        </ul>

        <div className="sidebar-footer">
          <span>GMP Mode</span>
          <span className="pill-muted">Pilot • On-prem</span>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="main">
        {/* TOP BAR */}
        <header className="top-bar">
          <div>
            <div className="page-tag">Stock Control • Live Pilot</div>
            <div className="page-title">
              {view === "dashboard" && (
                <>
                  Inventory Command Centre{" "}
                  <span style={{ fontSize: "13px", color: "#a5b4fc" }}>
                    / ES Specials
                  </span>
                </>
              )}
              {view === "materials" && (
                <>
                  Materials Library{" "}
                  <span style={{ fontSize: "13px", color: "#a5b4fc" }}>
                    / ES Master Data
                  </span>
                </>
              )}
              {view === "receipts" && (
                <>
                  Goods Receipts{" "}
                  <span style={{ fontSize: "13px", color: "#a5b4fc" }}>
                    / Historic Purchases
                  </span>
                </>
              )}
              {view === "issues" && (
                <>
                  Issues &amp; Consumption{" "}
                  <span style={{ fontSize: "13px", color: "#a5b4fc" }}>
                    / ES Batch Usage
                  </span>
                </>
              )}
              {view === "lots" && (
                <>
                  Live Lot Balances{" "}
                  <span style={{ fontSize: "13px", color: "#a5b4fc" }}>
                    / On-hand Stock
                  </span>
                </>
              )}
            </div>
            <div className="page-subtitle">
              {view === "dashboard"
                ? "See your materials, expiries and locations in one boujee, high-trust view."
                : "Search, filter and drill into the ES stock ledger with GMP-style traceability."}
            </div>
          </div>
          <div className="top-bar-actions">
            <div className="chip">
              <span className="chip-dot" />
              Stock engine healthy
            </div>
            {/* Global quick actions */}
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowNewMaterialModal(true)}
            >
              🧪 New Material
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowReceiptModal(true)}
            >
              📥 New Goods Receipt
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setShowIssueModal(true)}
            >
              🚚 New Consumption
            </button>
          </div>
        </header>

        {/* PAGE BODY */}
        {view === "dashboard" && <DashboardView materials={materials} />}

        {view === "materials" && (
          <MaterialsLibraryView
            materials={materials}
            onEditMaterial={(m) => setEditingMaterial(m)}
          />
        )}

        {view === "receipts" && (
          <GoodsReceiptsView
            receipts={receipts}
            loadingReceipts={loadingReceipts}
            receiptsError={receiptsError}
            onNewReceipt={() => setShowReceiptModal(true)}
          />
        )}

        {view === "issues" && (
          <ConsumptionView
            issues={issues}
            loadingIssues={loadingIssues}
            issuesError={issuesError}
            onNewIssue={() => setShowIssueModal(true)}
          />
        )}

        {view === "lots" && (
          <LiveLotsView
            lotBalances={lotBalances}
            loadingLots={loadingLots}
            lotsError={lotsError}
            onLotStatusChanged={loadLotBalances}
          />
        )}
      </main>

      {/* MODALS */}
      <NewReceiptModal
        open={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        materials={materials}
        onReceiptPosted={handleReceiptPosted}
      />
      <IssueModal
        open={showIssueModal}
        onClose={() => setShowIssueModal(false)}
        materials={materials}
        lotBalances={lotBalances}
        onIssuePosted={handleIssuePosted}
      />
      <MaterialModal
        open={showNewMaterialModal}
        onClose={() => setShowNewMaterialModal(false)}
        mode="create"
        onSaved={handleMaterialSaved}
      />
      <MaterialModal
        open={!!editingMaterial}
        onClose={() => setEditingMaterial(null)}
        mode="edit"
        initial={editingMaterial || undefined}
        onSaved={handleMaterialSaved}
      />
    </div>
  );
};

export default App;
