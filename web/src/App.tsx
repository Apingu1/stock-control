// web/src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import type {
  LotBalance,
  Material,
  ViewMode,
  Receipt,
  Issue,
  UserMe,
  ExpiryThresholdRow,
} from "./types";
import { apiFetch, clearToken, fetchMe, getToken } from "./utils/api";

import DashboardView from "./components/dashboard/DashboardView";
import MaterialsLibraryView from "./components/materials/MaterialsLibraryView";
import GoodsReceiptsView from "./components/receipts/GoodsReceiptsView";
import ConsumptionView from "./components/issues/ConsumptionView";
import LiveLotsView from "./components/lots/LiveLotsView";
import AuditTrailView from "./components/audit/AuditTrailView";
import LowStockExpiryView from "./components/alerts/LowStockExpiryView";

import NewReceiptModal from "./components/modals/NewReceiptModal";
import IssueModal from "./components/modals/IssueModal";
import MaterialModal from "./components/modals/MaterialModal";

import LoginModal from "./components/modals/LoginModal";
import AdminUsersView from "./components/admin/AdminUsersView";
import AdminSettingsView from "./components/admin/AdminSettingsView";

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
  const canEditReceipts = hasPerm("receipts.edit");
  const canEditIssues = hasPerm("issues.edit");
  const canViewAudit = hasPerm("audit.view");

  // --- Data -----------------------------------------------------------------
  const [lotBalances, setLotBalances] = useState<LotBalance[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [expiryThresholds, setExpiryThresholds] = useState<ExpiryThresholdRow[]>(
    []
  );

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

  // Editing states
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);

  const [view, setView] = useState<ViewMode>("dashboard");

  // --- Derived: Alerts badge counts (combined low stock + low expiry) -------
  const alertsCounts = useMemo(() => {
    // Available qty by material (sum of AVAILABLE segments)
    const availByMat = new Map<string, number>();
    for (const r of lotBalances as any[]) {
      if (String(r.status).toUpperCase() !== "AVAILABLE") continue;

      const code = String(r.material_code ?? "");
      const balRaw = r.balance_qty ?? 0;
      const bal = typeof balRaw === "number" ? balRaw : Number(balRaw);
      const safeBal = Number.isFinite(bal) ? bal : 0;

      availByMat.set(code, (availByMat.get(code) ?? 0) + safeBal);
    }

    // Low stock flagged materials
    let lowStock = 0;
    for (const m of materials as any[]) {
      const thr = m.low_stock_threshold_qty;
      if (thr === null || thr === undefined) continue;

      const thrNum = typeof thr === "number" ? thr : Number(thr);
      if (!Number.isFinite(thrNum)) continue;

      const avail = availByMat.get(m.material_code) ?? 0;
      if (avail <= thrNum) lowStock += 1;
    }

    // Low expiry flagged lots (AVAILABLE lots where days_to_expiry <= material expiry_alert_days)
    let lowExpiry = 0;
    const matByCode = new Map<string, any>();
    for (const m of materials as any[]) matByCode.set(m.material_code, m);

    for (const r of lotBalances as any[]) {
      if (String(r.status).toUpperCase() !== "AVAILABLE") continue;

      const balRaw = r.balance_qty ?? 0;
      const bal = typeof balRaw === "number" ? balRaw : Number(balRaw);
      if (!Number.isFinite(bal) || bal <= 0) continue;

      if (!r.expiry_date) continue;

      const mat = matByCode.get(r.material_code);
      const alertDays = mat?.expiry_alert_days;
      if (alertDays === null || alertDays === undefined) continue;

      const alertNum = typeof alertDays === "number" ? alertDays : Number(alertDays);
      if (!Number.isFinite(alertNum)) continue;

      const dte = r.days_to_expiry;
      if (dte === null || dte === undefined) continue;

      const dteNum = typeof dte === "number" ? dte : Number(dte);
      if (!Number.isFinite(dteNum)) continue;

      if (dteNum <= alertNum) lowExpiry += 1;
    }

    return { lowStock, lowExpiry, total: lowStock + lowExpiry };
  }, [materials, lotBalances]);

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
      const res = await apiFetch("/materials/");
      const data = (await res.json()) as Material[];
      setMaterials(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadExpiryThresholds = async () => {
    try {
      const res = await apiFetch("/materials/expiry-thresholds");
      const data = (await res.json()) as ExpiryThresholdRow[];
      setExpiryThresholds(data);
    } catch (e) {
      console.error(e);
      setExpiryThresholds([]);
    }
  };

  const loadReceipts = async () => {
    try {
      setLoadingReceipts(true);
      setReceiptsError(null);
      const res = await apiFetch("/receipts/");
      const data = (await res.json()) as Receipt[];
      setReceipts(data);
    } catch (e: any) {
      console.error(e);
      setReceiptsError(e?.message ?? "Failed to load goods receipts");
    } finally {
      setLoadingReceipts(false);
    }
  };

  const loadIssues = async () => {
    try {
      setLoadingIssues(true);
      setIssuesError(null);
      const res = await apiFetch("/issues/");
      const data = (await res.json()) as Issue[];
      setIssues(data);
    } catch (e: any) {
      console.error(e);
      setIssuesError(e?.message ?? "Failed to load consumption history");
    } finally {
      setLoadingIssues(false);
    }
  };

  const loadAll = async () => {
    await Promise.all([
      loadLotBalances(),
      loadMaterials(),
      loadExpiryThresholds(),
      loadReceipts(),
      loadIssues(),
    ]);
  };

  const loadMyPermissions = async () => {
    try {
      const res = await apiFetch("/auth/my-permissions");
      const data = (await res.json()) as MyPermissionsResponse;
      setMyPermissions(data.permissions || []);
    } catch (e) {
      console.error(e);
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
    setEditingReceipt(null);
    setEditingIssue(null);
  };

  // --- Modal handlers -------------------------------------------------------
  const handleMaterialSaved = async () => {
    setShowNewMaterialModal(false);
    setEditingMaterial(null);
    await Promise.all([loadMaterials(), loadExpiryThresholds()]);
  };

  const handleReceiptPosted = async () => {
    setShowReceiptModal(false);
    setEditingReceipt(null);
    await Promise.all([loadLotBalances(), loadReceipts()]);
  };

  const handleIssuePosted = async () => {
    setShowIssueModal(false);
    setEditingIssue(null);
    await Promise.all([loadLotBalances(), loadIssues()]);
  };

  // --- Header helpers -------------------------------------------------------
  const header = useMemo(() => {
    const signed = me
      ? `Signed in as ${me.username} (${me.role})`
      : "Please sign in to continue.";

    switch (view) {
      case "dashboard":
        return { tag: "Workspace", title: "Dashboard", subtitle: signed };
      case "materials":
        return { tag: "Workspace", title: "Materials Library", subtitle: signed };
      case "receipts":
        return { tag: "Workspace", title: "Goods Receipts", subtitle: signed };
      case "consumption":
        return { tag: "Workspace", title: "Consumption", subtitle: signed };
      case "lots":
        return { tag: "Workspace", title: "Live Lots", subtitle: signed };
      case "alerts":
        return {
          tag: "Risk & Quality",
          title: "Low Stock & Expiry",
          subtitle: signed,
        };
      case "audit":
        return { tag: "Risk & Quality", title: "Audit Trail", subtitle: signed };
      case "admin":
        return { tag: "Admin", title: "Users & Roles", subtitle: signed };
      case "admin-settings":
        return { tag: "Admin", title: "Settings", subtitle: signed };
      default:
        return { tag: "Workspace", title: "Dashboard", subtitle: signed };
    }
  }, [view, me]);

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
              <div className="sidebar-section-label sidebar-section-label-admin">
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

              <li className="nav-item">
                <button
                  type="button"
                  className={"nav-link as-button " + (view === "admin-settings" ? "active" : "")}
                  onClick={() => setView("admin-settings")}
                >
                  <span className="icon">⚙️</span>
                  Settings
                </button>
              </li>
            </>
          )}
        </ul>

        <div className="sidebar-section-label">Risk &amp; Quality</div>
        <ul className="nav-list">
          {/* Existing placeholders kept intact */}
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

          {/* ✅ Phase D4 page + ✅ combined badge */}
          <li className="nav-item">
            <button
              type="button"
              className={"nav-link as-button " + (view === "alerts" ? "active" : "")}
              onClick={() => setView("alerts")}
              disabled={!me}
              title={!me ? "Please sign in" : ""}
            >
              <span className="icon">🚨</span>
              Low Stock &amp; Expiry
              {alertsCounts.total > 0 && (
                <span className="badge">{alertsCounts.total}</span>
              )}
            </button>
          </li>

          <li className="nav-item">
            <button
              type="button"
              className={"nav-link as-button " + (view === "audit" ? "active" : "")}
              onClick={() => setView("audit")}
              disabled={!me || !canViewAudit}
              title={
                !me
                  ? "Please sign in"
                  : !canViewAudit
                  ? "You do not have audit.view permission"
                  : ""
              }
            >
              <span className="icon">📑</span>
              Audit Trail
            </button>
          </li>
        </ul>

        <div
          className="sidebar-footer"
          style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}
        >
          {me ? (
            <>
              <div className="avatar-pill" style={{ justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="avatar-img">
                    {me.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="avatar-meta">
                    <div className="avatar-name">{me.username}</div>
                    <div className="avatar-role">{me.role}</div>
                  </div>
                </div>

                <button className="btn btn-ghost" type="button" onClick={logout}>
                  Logout
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>GMP Mode</span>
                <span className="pill-muted">Pilot • On-prem</span>
              </div>
            </>
          ) : (
            <div className="info-row">Please sign in.</div>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <main className="main">
        <header className="top-bar">
          <div>
            <div className="page-tag">{header.tag}</div>
            <div className="page-title">{header.title}</div>
            <div className="page-subtitle">{header.subtitle}</div>
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
            canEdit={!!canEditReceipts}
            onEditReceipt={(r) => {
              setEditingReceipt(r);
              setShowReceiptModal(true);
            }}
          />
        )}

        {view === "consumption" && (
          <ConsumptionView
            issues={issues}
            loadingIssues={loadingIssues}
            issuesError={issuesError}
            onNewIssue={() => setShowIssueModal(true)}
            canEdit={!!canEditIssues}
            onEditIssue={(i) => {
              setEditingIssue(i);
              setShowIssueModal(true);
            }}
          />
        )}

        {view === "alerts" && (
          <LowStockExpiryView materials={materials} lotBalances={lotBalances} />
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

        {view === "audit" && canViewAudit && <AuditTrailView />}

        {view === "admin" && isAdmin && <AdminUsersView />}
        {view === "admin-settings" && isAdmin && <AdminSettingsView />}
      </main>

      {/* MODALS */}
      <NewReceiptModal
        open={showReceiptModal}
        onClose={() => {
          setShowReceiptModal(false);
          setEditingReceipt(null);
        }}
        materials={materials}
        onReceiptPosted={handleReceiptPosted}
        mode={editingReceipt ? "edit" : "create"}
        initial={editingReceipt || undefined}
      />

      <IssueModal
        open={showIssueModal}
        onClose={() => {
          setShowIssueModal(false);
          setEditingIssue(null);
        }}
        materials={materials}
        lotBalances={lotBalances}
        onIssuePosted={handleIssuePosted}
        createdBy={me?.username || ""}
        mode={editingIssue ? "edit" : "create"}
        initial={editingIssue || undefined}
      />

      <MaterialModal
        open={showNewMaterialModal}
        onClose={() => setShowNewMaterialModal(false)}
        mode="create"
        onSaved={handleMaterialSaved}
        expiryThresholds={expiryThresholds}
      />

      <MaterialModal
        open={!!editingMaterial}
        onClose={() => setEditingMaterial(null)}
        mode="edit"
        initial={editingMaterial || undefined}
        onSaved={handleMaterialSaved}
        expiryThresholds={expiryThresholds}
      />
    </div>
  );
};

export default App;
