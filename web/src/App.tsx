// web/src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { LotBalance, Material, ViewMode, Receipt, Issue, UserMe } from "./types";
import { apiFetch, clearToken, fetchMe, getToken } from "./utils/api";

import DashboardView from "./components/dashboard/DashboardView";
import MaterialsLibraryView from "./components/materials/MaterialsLibraryView";
import GoodsReceiptsView from "./components/receipts/GoodsReceiptsView";
import ConsumptionView from "./components/issues/ConsumptionView";
import LiveLotsView from "./components/lots/LiveLotsView";

import NewReceiptModal from "./components/modals/NewReceiptModal";
import IssueModal from "./components/modals/IssueModal";
import MaterialModal from "./components/modals/MaterialModal";

import LoginModal from "./components/modals/LoginModal";
import AdminUsersView from "./components/admin/AdminUsersView";

type MyPermissionsResponse = {
  role: string;
  permissions: string[];
};

const App: React.FC = () => {
  // --- Auth -----------------------------------------------------------------
  const [me, setMe] = useState<UserMe | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  // Phase B: permissions (UX only; server enforces)
  const [myPermissions, setMyPermissions] = useState<string[]>([]);

  const hasPerm = useMemo(() => {
    const s = new Set(myPermissions);
    return (p: string) => s.has(p);
  }, [myPermissions]);

  const isAdmin = hasPerm("admin.full");
  const canChangeStatus = hasPerm("lots.status_change");

  // --- Data -----------------------------------------------------------------
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
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

  const [view, setView] = useState<ViewMode>("dashboard");

  // --- Loaders --------------------------------------------------------------

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
    } catch (e: any) {
      console.error("Failed to load materials", e);
      // keep existing list
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

  const loadAll = async () => {
    await Promise.all([loadLotBalances(), loadMaterials(), loadReceipts(), loadIssues()]);
  };

  // Phase B: permissions fetch
  const loadMyPermissions = async () => {
    try {
      const res = await apiFetch("/auth/my-permissions");
      const data = (await res.json()) as MyPermissionsResponse;
      setMyPermissions(Array.isArray(data.permissions) ? data.permissions : []);
    } catch {
      // Non-blocking: if endpoint missing or user not authed, just blank it
      setMyPermissions([]);
    }
  };

  // --- Auth bootstrap -------------------------------------------------------

  useEffect(() => {
    const boot = async () => {
      const token = getToken();
      if (!token) {
        setMe(null);
        setMyPermissions([]);
        setAuthChecked(true);
        setShowLogin(true);
        return;
      }

      try {
        const u = await fetchMe();
        setMe(u);
        await loadMyPermissions();
        setAuthChecked(true);
        setShowLogin(false);
        await loadAll();
      } catch (e) {
        clearToken();
        setMe(null);
        setMyPermissions([]);
        setAuthChecked(true);
        setShowLogin(true);
      }
    };

    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoggedIn = async (u: UserMe) => {
    setMe(u);
    setShowLogin(false);
    await loadMyPermissions();
    await loadAll();
  };

  const logout = () => {
    clearToken();
    setMe(null);
    setMyPermissions([]);
    setShowLogin(true);
    setView("dashboard");
    setLotBalances([]);
    setMaterials([]);
    setReceipts([]);
    setIssues([]);
  };

  // --- Modal handlers -------------------------------------------------------

  const handleMaterialSaved = async () => {
    setShowNewMaterialModal(false);
    setEditingMaterial(null);
    await loadMaterials();
  };

  const handleReceiptPosted = async () => {
    setShowReceiptModal(false);
    await Promise.all([loadLotBalances(), loadReceipts()]);
  };

  const handleIssuePosted = async () => {
    setShowIssueModal(false);
    await Promise.all([loadLotBalances(), loadIssues()]);
  };

  // --- Loading gate ---------------------------------------------------------

  if (!authChecked) {
    return (
      <div className="app-shell">
        <div className="content">
          <section className="card">
            <div className="info-row">Loading…</div>
          </section>
        </div>
      </div>
    );
  }

  // --- Render ---------------------------------------------------------------

  return (
    <div className="app-shell">
      <LoginModal open={showLogin} onLoggedIn={handleLoggedIn} />

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
              className={"nav-link as-button " + (view === "dashboard" ? "active" : "")}
              onClick={() => setView("dashboard")}
              disabled={!me}
              title={!me ? "Please sign in" : ""}
            >
              <span className="icon">📊</span>
              Dashboard
              <span className="badge">Today</span>
            </button>
          </li>

          <li className="nav-item">
            <button
              type="button"
              className={"nav-link as-button " + (view === "materials" ? "active" : "")}
              onClick={() => setView("materials")}
              disabled={!me}
              title={!me ? "Please sign in" : ""}
            >
              <span className="icon">🧪</span>
              Materials Library
            </button>
          </li>

          <li className="nav-item">
            <button
              type="button"
              className={"nav-link as-button " + (view === "receipts" ? "active" : "")}
              onClick={() => setView("receipts")}
              disabled={!me}
              title={!me ? "Please sign in" : ""}
            >
              <span className="icon">📥</span>
              Goods Receipts
            </button>
          </li>

          <li className="nav-item">
            <button
              type="button"
              className={"nav-link as-button " + (view === "consumption" ? "active" : "")}
              onClick={() => setView("consumption")}
              disabled={!me}
              title={!me ? "Please sign in" : ""}
            >
              <span className="icon">🚚</span>
              Consumption
            </button>
          </li>

          <li className="nav-item">
            <button
              type="button"
              className={"nav-link as-button " + (view === "lots" ? "active" : "")}
              onClick={() => setView("lots")}
              disabled={!me}
              title={!me ? "Please sign in" : ""}
            >
              <span className="icon">📦</span>
              Live Lots
            </button>
          </li>

          {isAdmin && (
            <>
              <div className="sidebar-section-label" style={{ marginTop: 14 }}>
                Admin
              </div>
              <li className="nav-item">
                <button
                  type="button"
                  className={"nav-link as-button " + (view === "admin" ? "active" : "")}
                  onClick={() => setView("admin")}
                >
                  <span className="icon">👤</span>
                  Users &amp; Roles
                </button>
              </li>
            </>
          )}
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

        <div style={{ flex: 1 }} />

        <div className="sidebar-footer" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          {me ? (
            <div style={{ width: "100%" }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                Signed in as <b>{me.username}</b> ({me.role})
              </div>
              <button className="btn" style={{ marginTop: 10, width: "100%" }} onClick={logout}>
                Logout
              </button>
            </div>
          ) : (
            <div className="info-row">Please sign in.</div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>GMP Mode</span>
            <span className="pill-muted">Pilot • On-prem</span>
          </div>
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
                  <span style={{ fontSize: "13px", color: "#a5b4fc" }}>/ ES Specials</span>
                </>
              )}
              {view === "materials" && (
                <>
                  Materials Library{" "}
                  <span style={{ fontSize: "13px", color: "#a5b4fc" }}>/ ES Master Data</span>
                </>
              )}
              {view === "receipts" && (
                <>
                  Goods Receipts{" "}
                  <span style={{ fontSize: "13px", color: "#a5b4fc" }}>/ Historic Purchases</span>
                </>
              )}
              {view === "consumption" && (
                <>
                  Issues &amp; Consumption{" "}
                  <span style={{ fontSize: "13px", color: "#a5b4fc" }}>/ ES Batch Usage</span>
                </>
              )}
              {view === "lots" && (
                <>
                  Live Lot Balances{" "}
                  <span style={{ fontSize: "13px", color: "#a5b4fc" }}>/ On-hand Stock</span>
                </>
              )}
              {view === "admin" && (
                <>
                  Admin — Users &amp; Roles{" "}
                  <span style={{ fontSize: "13px", color: "#a5b4fc" }}>/ Access Control</span>
                </>
              )}
            </div>

            <div className="page-subtitle">
              {view === "dashboard"
                ? "See your materials, expiries and locations in one boujee, high-trust view."
                : view === "admin"
                ? "Create users, assign roles and control access (server-enforced)."
                : "Search, filter and drill into the ES stock ledger with GMP-style traceability."}
            </div>
          </div>

          <div className="top-bar-actions">
            <div className="chip">
              <span className="chip-dot" />
              Stock engine healthy
            </div>

            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowNewMaterialModal(true)}
              disabled={!me}
              title={!me ? "Please sign in" : ""}
            >
              🧪 New Material
            </button>

            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowReceiptModal(true)}
              disabled={!me}
              title={!me ? "Please sign in" : ""}
            >
              📥 New Goods Receipt
            </button>

            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setShowIssueModal(true)}
              disabled={!me}
              title={!me ? "Please sign in" : ""}
            >
              🚚 New Consumption
            </button>
          </div>
        </header>

        {/* PAGE BODY */}
        {view === "dashboard" && <DashboardView materials={materials} />}

        {view === "materials" && (
          <MaterialsLibraryView materials={materials} onEditMaterial={(m) => setEditingMaterial(m)} />
        )}

        {view === "receipts" && (
          <GoodsReceiptsView
            receipts={receipts}
            loadingReceipts={loadingReceipts}
            receiptsError={receiptsError}
            onNewReceipt={() => setShowReceiptModal(true)}
          />
        )}

        {view === "consumption" && (
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
            canChangeStatus={!!canChangeStatus}
          />
        )}

        {view === "admin" && isAdmin && <AdminUsersView />}
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
        createdBy={me?.username || ""}
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
