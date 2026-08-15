// web/src/App.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Issue, Material, Receipt, UserMe, ViewMode } from "./types";
import {
  AUTH_EXPIRED_EVENT,
  clearToken,
  fetchMe,
  getToken,
  logoutSession,
} from "./utils/api";

import { useAuth } from "./hooks/useAuth";
import { usePermissions } from "./hooks/usePermissions";
import { useStockData } from "./hooks/useStockData";
import { useBackgroundRefresh } from "./hooks/useBackgroundRefresh";
import { useAlertsBadge } from "./hooks/useAlertsBadge";
import { useIdleLogout } from "./hooks/useIdleLogout";

import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";

import DashboardView from "./components/dashboard/DashboardView";
import MaterialsLibraryView from "./components/materials/MaterialsLibraryView";
import ProductListView from "./components/products/ProductListView";
import GoodsReceiptsView from "./components/receipts/GoodsReceiptsView";
import ConsumptionView from "./components/issues/ConsumptionView";
import LiveLotsView from "./components/lots/LiveLotsView";
import AnalyticsView from "./components/analytics/AnalyticsView";
import AuditTrailView from "./components/audit/AuditTrailView";
import LowStockExpiryView from "./components/alerts/LowStockExpiryView";

import QuarantineView from "./components/quarantine/QuarantineView";

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
  const canViewProducts = hasPerm("products.view");
  const canCreateProducts = hasPerm("products.create");
  const canEditProducts = hasPerm("products.edit");
  const canChangeProductStatus = hasPerm("products.status_change");
  const canApproveRejectedBatch = hasPerm("issues.approve_rejected_batch");
  const canRecordCancelledBmr = hasPerm("issues.record_cancelled_bmr");

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
  const [loginMessage, setLoginMessage] = useState<string | null>(null);

  // Deep-link support: Dashboard → Analytics batch page
  const [analyticsInitialBatchNo, setAnalyticsInitialBatchNo] = useState<string | null>(null);

  const { alertsCounts } = useAlertsBadge(stock.materials, stock.lotBalances, !!auth.me);

  const operationalPollingEnabled =
    !!auth.me &&
    (showReceiptModal ||
      showIssueModal ||
      view === "dashboard" ||
      view === "alerts" ||
      view === "lots" ||
      view === "receipts" ||
      view === "consumption" ||
      view === "quarantine");

  const operationalIntervalMs =
    showReceiptModal || showIssueModal
      ? 2_500
      : view === "dashboard" || view === "alerts"
        ? 5_000
        : 2_500;

  const refreshOperationalData = useCallback(async () => {
    const jobs: Promise<void>[] = [];
    const needsLots =
      showReceiptModal ||
      showIssueModal ||
      view === "dashboard" ||
      view === "alerts" ||
      view === "lots" ||
      view === "receipts" ||
      view === "consumption" ||
      view === "quarantine";

    if (needsLots) jobs.push(stock.loadLotBalances({ silent: true }));
    if (showReceiptModal || view === "receipts") {
      jobs.push(stock.loadReceipts({ silent: true }));
    }
    if (showIssueModal || view === "consumption") {
      jobs.push(stock.loadIssues({ silent: true }));
    }
    await Promise.all(jobs);
  }, [
    showIssueModal,
    showReceiptModal,
    stock.loadIssues,
    stock.loadLotBalances,
    stock.loadReceipts,
    view,
  ]);

  useBackgroundRefresh(refreshOperationalData, {
    enabled: operationalPollingEnabled,
    intervalMs: operationalIntervalMs,
    label: "operational stock refresh",
  });

  const refreshReferenceData = useCallback(async () => {
    await Promise.all([
      stock.loadMaterials({ silent: true }),
      stock.loadProducts({ silent: true }),
      stock.loadExpiryThresholds({ silent: true }),
    ]);
  }, [stock.loadExpiryThresholds, stock.loadMaterials, stock.loadProducts]);

  useBackgroundRefresh(refreshReferenceData, {
    enabled: !!auth.me,
    intervalMs: 10_000,
    label: "reference data refresh",
  });

  const setAuthenticatedUser = auth.setMe;
  const setLoginOpen = auth.setShowLogin;
  const setCurrentPermissions = perms.setMyPermissions;
  const clearLotBalances = stock.setLotBalances;
  const clearMaterials = stock.setMaterials;
  const clearProducts = stock.setProducts;
  const clearReceipts = stock.setReceipts;
  const clearIssues = stock.setIssues;
  const clearExpiryThresholds = stock.setExpiryThresholds;

  const logout = useCallback(
    (message: string | null = null, notifyServer = true) => {
      if (notifyServer && getToken()) {
        void logoutSession().catch(() => {
          // Local logout still completes if the session is already unavailable.
        });
      }
      clearToken();
      setAuthenticatedUser(null);
      setCurrentPermissions([]);
      setLoginOpen(true);
      setLoginMessage(message);
      setView("dashboard");
      setAnalyticsInitialBatchNo(null);
      clearLotBalances([]);
      clearMaterials([]);
      clearProducts([]);
      clearReceipts([]);
      clearIssues([]);
      clearExpiryThresholds([]);
      setShowReceiptModal(false);
      setShowIssueModal(false);
      setShowNewMaterialModal(false);
      setEditingMaterial(null);
      setEditingReceipt(null);
      setEditingIssue(null);
    },
    [
      clearExpiryThresholds,
      clearIssues,
      clearLotBalances,
      clearMaterials,
      clearProducts,
      clearReceipts,
      setAuthenticatedUser,
      setCurrentPermissions,
      setLoginOpen,
    ]
  );

  useIdleLogout({
    enabled: !!auth.me,
    onTimeout: (timeoutMinutes) =>
      logout(`Signed out after ${timeoutMinutes} minutes of inactivity.`, false),
  });

  useEffect(() => {
    const handleAuthExpired = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      const message = detail?.message?.toLowerCase().includes("inactivity")
        ? "Signed out because the inactivity limit was reached."
        : "Your session has ended. Please sign in again.";
      logout(message, false);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [logout]);

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
      } catch {
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
    setLoginMessage(null);
    await perms.loadMyPermissions();
    await stock.loadAll();
  };

  // --- Modal handlers -------------------------------------------------------
  const handleMaterialSaved = async () => {
    setShowNewMaterialModal(false);
    setEditingMaterial(null);
    await Promise.all([stock.loadMaterials(), stock.loadProducts(), stock.loadExpiryThresholds()]);
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
      case "products":
        return { tag: "Workspace", title: "Product List", subtitle: signed };
      case "receipts":
        return { tag: "Workspace", title: "Goods Receipts", subtitle: signed };
      case "consumption":
        return { tag: "Workspace", title: "Consumption", subtitle: signed };
      case "lots":
        return { tag: "Workspace", title: "Live Lots", subtitle: signed };
      case "quarantine":
        return { tag: "Risk & Quality", title: "Quarantine", subtitle: signed };
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

  if (!auth.me) {
    return (
      <div className="app-shell">
        <LoginModal
          open={auth.showLogin}
          message={loginMessage}
          onLoggedIn={handleLoggedIn}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        me={auth.me}
        view={view}
        setView={setView}
        isAdmin={isAdmin}
        canViewAudit={canViewAudit}
        canViewProducts={canViewProducts}
        alertsCounts={alertsCounts}
        onLogout={() => logout()}
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
            onGoToBatch={(bn) => {
              setAnalyticsInitialBatchNo(bn);
              setView("analytics");
            }}
          />
        )}

        {view === "materials" && (
          <MaterialsLibraryView
            materials={stock.materials}
            onEditMaterial={(m) => setEditingMaterial(m)}
          />
        )}

        {view === "products" && canViewProducts && (
          <ProductListView
            products={stock.products}
            materials={stock.materials}
            loading={stock.loadingProducts}
            error={stock.productsError}
            canCreate={canCreateProducts}
            canEdit={canEditProducts}
            canChangeStatus={canChangeProductStatus}
            reload={stock.loadProducts}
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

        {view === "quarantine" && (
          <QuarantineView isAdmin={isAdmin} hasPerm={hasPerm} />
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

        {view === "analytics" && (
          <AnalyticsView
            initialBatchNo={analyticsInitialBatchNo ?? undefined}
            onClearInitialBatch={() => setAnalyticsInitialBatchNo(null)}
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
        products={stock.products}
        onIssuePosted={handleIssuePosted}
        createdBy={auth.me?.username || ""}
        mode={editingIssue ? "edit" : "create"}
        initial={editingIssue || undefined}
        canSuperEditLockedFields={canSuperEditIssues}
        canApproveRejectedBatch={canApproveRejectedBatch}
        canRecordCancelledBmr={canRecordCancelledBmr}
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
