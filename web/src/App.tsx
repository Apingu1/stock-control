// web/src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { Issue, Material, Receipt, UserMe, ViewMode } from "./types";
import { clearToken, fetchMe, getToken } from "./utils/api";

import { useAuth } from "./hooks/useAuth";
import { usePermissions } from "./hooks/usePermissions";
import { useStockData } from "./hooks/useStockData";
import { useAlertsBadge } from "./hooks/useAlertsBadge";

import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";

import DashboardView from "./components/dashboard/DashboardView";
import MaterialsLibraryView from "./components/materials/MaterialsLibraryView";
import GoodsReceiptsView from "./components/receipts/GoodsReceiptsView";
import ConsumptionView from "./components/issues/ConsumptionView";
import LiveLotsView from "./components/lots/LiveLotsView";
import AnalyticsView from "./components/analytics/AnalyticsView";
import AuditTrailView from "./components/audit/AuditTrailView";
import LowStockExpiryView from "./components/alerts/LowStockExpiryView";

import NewReceiptModal from "./components/modals/NewReceiptModal";
import IssueModal from "./components/modals/IssueModal";
import MaterialModal from "./components/modals/MaterialModal";

import LoginModal from "./components/modals/LoginModal";
import AdminUsersView from "./components/admin/AdminUsersView";
import AdminSettingsView from "./components/admin/AdminSettingsView";

const App: React.FC = () => {
  // --- Auth -----------------------------------------------------------------
  const auth = useAuth();

  // Phase B: permissions (UX only; server enforces)
  const perms = usePermissions();
  const hasPerm = perms.hasPerm;

  const isAdmin = hasPerm("admin.full");
  const canChangeStatus = hasPerm("lots.status_change");
  const canEditReceipts = hasPerm("receipts.edit");
  const canEditIssues = hasPerm("issues.edit");

  const canSuperEditMaterials = hasPerm("materials.super_edit_locked_fields");
  const canSuperEditReceipts = hasPerm("receipts.super_edit_locked_fields");
  const canSuperEditIssues = hasPerm("issues.super_edit_locked_fields");

  const canViewAudit = hasPerm("audit.view");

  // --- Data -----------------------------------------------------------------
  const stock = useStockData();

  // Modals
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showNewMaterialModal, setShowNewMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

  // Editing states
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);

  const [view, setView] = useState<ViewMode>("dashboard");

  const { alertsCounts } = useAlertsBadge(stock.materials, stock.lotBalances);

  // --- Auth bootstrap -------------------------------------------------------
  useEffect(() => {
    const boot = async () => {
      const token = getToken();
      if (!token) {
        auth.setMe(null);
        perms.setMyPermissions([]);
        auth.setAuthChecked(true);
        auth.setShowLogin(true);
        return;
      }

      try {
        const u = await fetchMe();
        auth.setMe(u);
        await perms.loadMyPermissions();
        auth.setAuthChecked(true);
        auth.setShowLogin(false);
        await stock.loadAll();
      } catch (e) {
        clearToken();
        auth.setMe(null);
        perms.setMyPermissions([]);
        auth.setAuthChecked(true);
        auth.setShowLogin(true);
      }
    };

    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoggedIn = async (u: UserMe) => {
    auth.setMe(u);
    auth.setShowLogin(false);
    await perms.loadMyPermissions();
    await stock.loadAll();
  };

  const logout = () => {
    clearToken();
    auth.setMe(null);
    perms.setMyPermissions([]);
    auth.setShowLogin(true);
    setView("dashboard");
    stock.setLotBalances([]);
    stock.setMaterials([]);
    stock.setReceipts([]);
    stock.setIssues([]);
    setEditingReceipt(null);
    setEditingIssue(null);
  };

  // --- Modal handlers -------------------------------------------------------
  const handleMaterialSaved = async () => {
    setShowNewMaterialModal(false);
    setEditingMaterial(null);
    await Promise.all([stock.loadMaterials(), stock.loadExpiryThresholds()]);
  };

  const handleReceiptPosted = async () => {
    setShowReceiptModal(false);
    setEditingReceipt(null);
    await Promise.all([stock.loadLotBalances(), stock.loadReceipts()]);
  };

  const handleIssuePosted = async () => {
    setShowIssueModal(false);
    setEditingIssue(null);
    await Promise.all([stock.loadLotBalances(), stock.loadIssues()]);
  };

  // --- Header helpers -------------------------------------------------------
  const header = useMemo(() => {
    const signed = auth.me
      ? `Signed in as ${auth.me.username} (${auth.me.role})`
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
        return { tag: "Risk & Quality", title: "Low Stock & Expiry", subtitle: signed };
      case "analytics":
        return { tag: "Analytics", title: "Inventory Analytics", subtitle: signed };
      case "audit":
        return { tag: "Risk & Quality", title: "Audit Trail", subtitle: signed };
      case "admin":
        return { tag: "Admin", title: "Users & Roles", subtitle: signed };
      case "admin-settings":
        return { tag: "Admin", title: "Settings", subtitle: signed };
      default:
        return { tag: "Workspace", title: "Dashboard", subtitle: signed };
    }
  }, [view, auth.me]);

  if (!auth.authChecked) {
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
      <LoginModal open={auth.showLogin} onLoggedIn={handleLoggedIn} />

      <Sidebar
        me={auth.me}
        view={view}
        setView={setView}
        isAdmin={isAdmin}
        canViewAudit={canViewAudit}
        alertsCounts={alertsCounts}
        onLogout={logout}
      />

      <main className="main">
        <TopBar
          header={header}
          isSignedIn={!!auth.me}
          onNewMaterial={() => setShowNewMaterialModal(true)}
          onNewReceipt={() => setShowReceiptModal(true)}
          onNewIssue={() => setShowIssueModal(true)}
        />

        {view === "dashboard" && (
          <DashboardView
            materials={stock.materials}
            lotBalances={stock.lotBalances}
            onGoToAlerts={() => setView("alerts")}
          />
        )}

        {view === "materials" && (
          <MaterialsLibraryView
            materials={stock.materials}
            onEditMaterial={(m) => setEditingMaterial(m)}
          />
        )}

        {view === "receipts" && (
          <GoodsReceiptsView
            receipts={stock.receipts}
            loadingReceipts={stock.loadingReceipts}
            receiptsError={stock.receiptsError}
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
            issues={stock.issues}
            loadingIssues={stock.loadingIssues}
            issuesError={stock.issuesError}
            onNewIssue={() => setShowIssueModal(true)}
            canEdit={!!canEditIssues}
            onEditIssue={(i) => {
              setEditingIssue(i);
              setShowIssueModal(true);
            }}
          />
        )}

        {view === "alerts" && (
          <LowStockExpiryView materials={stock.materials} lotBalances={stock.lotBalances} />
        )}

        {view === "lots" && (
          <LiveLotsView
            lotBalances={stock.lotBalances}
            loadingLots={stock.loadingLots}
            lotsError={stock.lotsError}
            onLotStatusChanged={stock.loadLotBalances}
            canChangeStatus={!!canChangeStatus}
          />
        )}

        {view === "analytics" && <AnalyticsView />}

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
        materials={stock.materials}
        onReceiptPosted={handleReceiptPosted}
        mode={editingReceipt ? "edit" : "create"}
        initial={editingReceipt || undefined}
        canSuperEditLockedFields={canSuperEditReceipts}
      />

      <IssueModal
        open={showIssueModal}
        onClose={() => {
          setShowIssueModal(false);
          setEditingIssue(null);
        }}
        materials={stock.materials}
        lotBalances={stock.lotBalances}
        onIssuePosted={handleIssuePosted}
        createdBy={auth.me?.username || ""}
        mode={editingIssue ? "edit" : "create"}
        initial={editingIssue || undefined}
        canSuperEditLockedFields={canSuperEditIssues}
      />

      <MaterialModal
        open={showNewMaterialModal}
        onClose={() => setShowNewMaterialModal(false)}
        mode="create"
        onSaved={handleMaterialSaved}
        expiryThresholds={stock.expiryThresholds}
        canSuperEditLockedFields={canSuperEditMaterials}
      />

      <MaterialModal
        open={!!editingMaterial}
        onClose={() => setEditingMaterial(null)}
        mode="edit"
        initial={editingMaterial || undefined}
        onSaved={handleMaterialSaved}
        expiryThresholds={stock.expiryThresholds}
        canSuperEditLockedFields={canSuperEditMaterials}
      />
    </div>
  );
};

export default App;
