// web/src/App.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readDensityPreference, saveDensityPreference, type WorkspaceDensity } from "./utils/workspaceDensity";
import type { Issue, Material, Receipt, UserMe, ViewMode } from "./types";
import {
  AUTH_EXPIRED_EVENT,
  clearToken,
  fetchMe,
  getToken,
  logoutSession,
  apiFetch,
} from "./utils/api";

import { useAuth } from "./hooks/useAuth";
import { usePermissions } from "./hooks/usePermissions";
import { useStockData } from "./hooks/useStockData";
import { useBackgroundRefresh } from "./hooks/useBackgroundRefresh";
import { useAlertsBadge } from "./hooks/useAlertsBadge";
import { useIdleLogout } from "./hooks/useIdleLogout";

import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";
import WorkspaceDock from "./components/layout/WorkspaceDock";
import { draftLabel, nextWorkspaceDraft, WORKSPACE_DRAFT_LIMIT, type WorkspaceDraft, type WorkspaceDraftKind } from "./utils/workspaceDrafts";

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
  // The dock owns independently mounted CREATE drafts; existing-record edits
  // remain single-instance and do not participate in multi-draft workflows.
  const [drafts, setDrafts] = useState<WorkspaceDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftValidation, setDraftValidation] = useState<{id: string; error: string | null} | null>(null);
  const nextDraftId = useRef(1);
  const completedDraftIds = useRef(new Set<string>());
  const activeDraftKind = drafts.find((draft) => draft.id === activeDraftId)?.kind ?? null;
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

  // Editing states
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);

  const [view, setView] = useState<ViewMode>("dashboard");
  const [density, setDensity] = useState<WorkspaceDensity>(readDensityPreference);
  const handleDensityChange = useCallback((next: WorkspaceDensity) => {
    setDensity(next);
    saveDensityPreference(next);
  }, []);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);

  // Deep-link support: Dashboard → Analytics batch page
  const [analyticsInitialBatchNo, setAnalyticsInitialBatchNo] = useState<string | null>(null);

  const { alertsCounts } = useAlertsBadge(stock.materials, stock.lotBalances, !!auth.me);

  const operationalPollingEnabled =
    !!auth.me &&
    (activeDraftKind === "receipt" ||
      activeDraftKind === "consumption" ||
      view === "dashboard" ||
      view === "alerts" ||
      view === "lots" ||
      view === "receipts" ||
      view === "consumption" ||
      view === "quarantine");

  const operationalIntervalMs =
    activeDraftKind === "receipt" || activeDraftKind === "consumption"
      ? 2_500
      : view === "dashboard" || view === "alerts"
        ? 5_000
        : 2_500;

  const refreshOperationalData = useCallback(async () => {
    const jobs: Promise<void>[] = [];
    const needsLots =
      activeDraftKind === "receipt" ||
      activeDraftKind === "consumption" ||
      view === "dashboard" ||
      view === "alerts" ||
      view === "lots" ||
      view === "receipts" ||
      view === "consumption" ||
      view === "quarantine";

    if (needsLots) jobs.push(stock.loadLotBalances({ silent: true }));
    if (activeDraftKind === "receipt" || view === "receipts") {
      jobs.push(stock.loadReceipts({ silent: true }));
    }
    if (activeDraftKind === "consumption" || view === "consumption") {
      jobs.push(stock.loadIssues({ silent: true }));
    }
    await Promise.all(jobs);
  }, [
    activeDraftKind,
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

  // Active drafts must use fresh API data before they can be posted.
  // Unlike background stock loaders, these requests throw on failed refresh.
  const refreshDraft = useCallback(async (id: string, kind: WorkspaceDraftKind) => {
    setDraftValidation({ id, error: null });
    try {
      const urls = kind === "material"
        ? ["/materials/", "/materials/expiry-thresholds"]
        : kind === "receipt"
          ? ["/materials/", "/lot-balances/"]
          : ["/materials/", "/products/", "/lot-balances/"];
      const replies = await Promise.all(urls.map((url) => apiFetch(url)));
      const values = await Promise.all(replies.map((reply) => reply.json()));
      stock.setMaterials(values[0]);
      if (kind === "material") stock.setExpiryThresholds(values[1]);
      if (kind === "receipt") stock.setLotBalances(values[1]);
      if (kind === "consumption") {
        stock.setProducts(values[1]);
        stock.setLotBalances(values[2]);
      }
      setDraftValidation((current) => current?.id === id ? null : current);
    } catch (error) {
      setDraftValidation((current) => current?.id === id ? {
        id, error: error instanceof Error ? error.message : "Stock/reference data refresh failed",
      } : current);
    }
  }, [stock.setMaterials, stock.setExpiryThresholds, stock.setLotBalances, stock.setProducts]);

  const createDraft = (kind: WorkspaceDraftKind) => {
    if (drafts.length >= WORKSPACE_DRAFT_LIMIT) {
      window.alert("Workspace has reached its limit of " + WORKSPACE_DRAFT_LIMIT + " drafts. Complete or discard one first.");
      return;
    }
    const id = "draft-" + nextDraftId.current++;
    const draft = nextWorkspaceDraft(drafts, kind, id);
    if (!draft) return;
    setDrafts((current) => [...current, draft]);
    setActiveDraftId(id);
    void refreshDraft(id, kind);
  };

  const activateDraft = (id: string) => {
    const draft = drafts.find((item) => item.id === id);
    if (!draft) return;
    setActiveDraftId(id);
    void refreshDraft(id, draft.kind);
  };

  const markDraftDirty = (id: string) => {
    setDrafts((current) => current.map((draft) => draft.id === id && !draft.dirty
      ? { ...draft, dirty: true }
      : draft));
  };

  const removeDraft = (id: string) => {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
    setActiveDraftId((current) => current === id ? null : current);
    setDraftValidation((current) => current?.id === id ? null : current);
  };

  const discardDraft = (id: string) => {
    if (completedDraftIds.current.delete(id)) return;
    const draft = drafts.find((item) => item.id === id);
    if (!draft) return;
    if (draft.dirty && !window.confirm("Discard " + draftLabel(draft) + "? All unsaved entries in this draft will be lost.")) return;
    removeDraft(id);
  };

  const completeDraft = (id: string, kind: WorkspaceDraftKind) => {
    completedDraftIds.current.add(id);
    removeDraft(id);
    if (kind === "material") void Promise.all([stock.loadMaterials(), stock.loadProducts(), stock.loadExpiryThresholds()]);
    else if (kind === "receipt") void Promise.all([stock.loadLotBalances(), stock.loadReceipts()]);
    else void Promise.all([stock.loadLotBalances(), stock.loadIssues()]);
  };

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
      // GMP draft state is transient and must be destroyed on logout,
      // including session timeout and authentication expiry.
      setDrafts([]);
      setActiveDraftId(null);
      setDraftValidation(null);
      completedDraftIds.current.clear();
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
    setEditingMaterial(null);
    await Promise.all([stock.loadMaterials(), stock.loadProducts(), stock.loadExpiryThresholds()]);
  };

  const handleReceiptPosted = async () => {
    setEditingReceipt(null);
    await Promise.all([stock.loadLotBalances(), stock.loadReceipts()]);
  };

  const handleIssuePosted = async () => {
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
      <div className="app-shell stkflo-auth-shell">
        <LoginModal
          open={auth.showLogin}
          message={loginMessage}
          onLoggedIn={handleLoggedIn}
        />
      </div>
    );
  }

  return (
    <div className="app-shell" data-density={density}>
      <Sidebar
        me={auth.me}
        view={view}
        setView={setView}
        isAdmin={isAdmin}
        canViewAudit={canViewAudit}
        canViewProducts={canViewProducts}
        alertsCounts={alertsCounts}
        onLogout={() => {
          if (drafts.some((draft) => draft.dirty) &&
              !window.confirm("Sign out and discard all unsaved Workspace Dock drafts?")) return;
          logout();
        }}
      />

      <main className="main">
        <TopBar
          density={density}
          onDensityChange={handleDensityChange}
          header={header}
          isSignedIn={!!auth.me}
          onNewMaterial={() => createDraft("material")}
          onNewReceipt={() => createDraft("receipt")}
          onNewIssue={() => createDraft("consumption")}
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
            onEditMaterial={(m) => { setActiveDraftId(null); setEditingMaterial(m); }}
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
            onNewReceipt={() => createDraft("receipt")}
            canEdit={!!canEditReceipts}
            onEditReceipt={(r) => {
              setActiveDraftId(null);
              setEditingReceipt(r);
            }}
          />
        )}

        {view === "consumption" && (
          <ConsumptionView
            issues={stock.issues}
            loadingIssues={stock.loadingIssues}
            issuesError={stock.issuesError}
            onNewIssue={() => createDraft("consumption")}
            canEdit={!!canEditIssues}
            onEditIssue={(i) => {
              setActiveDraftId(null);
              setEditingIssue(i);
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

      {/* Only one CREATE draft is visible; all are mounted to preserve form state. */}
      {drafts.map((draft) => {
        const active = draft.id === activeDraftId;
        const validating = active && draftValidation?.id === draft.id;
        return (
          <div key={draft.id}
            className={"sf-draft-slot " + (active ? "sf-active-draft" : "sf-minimised-draft") + (validating ? " is-refreshing" : "")}
            aria-hidden={!active}
            onChangeCapture={() => markDraftDirty(draft.id)}
            onInputCapture={() => markDraftDirty(draft.id)}
            onClickCapture={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest(".issue-batch-scroll button, .modal-body button[type='button']")) {
                markDraftDirty(draft.id);
              }
            }}
          >
            {draft.kind === "receipt" && (
              <NewReceiptModal open={true}
                onMinimize={() => setActiveDraftId(null)}
                onClose={() => discardDraft(draft.id)}
                materials={stock.materials}
                onReceiptPosted={() => completeDraft(draft.id, "receipt")}
                mode="create"
                canSuperEditLockedFields={canSuperEditReceipts}
              />
            )}
            {draft.kind === "consumption" && (
              <IssueModal open={true} active={active}
                onMinimize={() => setActiveDraftId(null)}
                onClose={() => discardDraft(draft.id)}
                materials={stock.materials}
                lotBalances={stock.lotBalances}
                products={stock.products}
                onIssuePosted={() => completeDraft(draft.id, "consumption")}
                createdBy={auth.me?.username || ""}
                mode="create"
                canSuperEditLockedFields={canSuperEditIssues}
                canApproveRejectedBatch={canApproveRejectedBatch}
                canRecordCancelledBmr={canRecordCancelledBmr}
              />
            )}
            {draft.kind === "material" && (
              <MaterialModal open={true}
                onMinimize={() => setActiveDraftId(null)}
                onClose={() => discardDraft(draft.id)}
                mode="create"
                onSaved={() => completeDraft(draft.id, "material")}
                expiryThresholds={stock.expiryThresholds}
                canSuperEditLockedFields={canSuperEditMaterials}
              />
            )}
            {validating && (
              <div className="sf-draft-validation-mask" role="status" aria-live="polite">
                <div className="sf-draft-validation-card">
                  <strong>{draftValidation?.error ? "Unable to refresh stock data" : "Checking current inventory and permissions…"}</strong>
                  <p>{draftValidation?.error
                    ? draftValidation.error + ". This draft remains saved in memory; retry before posting."
                    : "Refreshing current materials, quantities and lot statuses before this draft can be used."}</p>
                  {draftValidation?.error && (
                    <div className="sf-draft-validation-actions">
                      <button className="btn btn-primary" type="button" onClick={() => void refreshDraft(draft.id, draft.kind)}>Retry refresh</button>
                      <button className="btn" type="button" onClick={() => { setActiveDraftId(null); setDraftValidation(null); }}>Minimise</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {activeDraftId === null && editingMaterial === null && editingReceipt === null && editingIssue === null && (
        <WorkspaceDock drafts={drafts} onRestore={activateDraft} onDiscard={discardDraft} onNew={createDraft} />
      )}

      {/* EXISTING-RECORD EDIT MODALS: deliberately excluded from the multi-draft dock. */}
      <NewReceiptModal
        open={!!editingReceipt}
        onClose={() => setEditingReceipt(null)}
        materials={stock.materials}
        onReceiptPosted={handleReceiptPosted}
        mode="edit"
        initial={editingReceipt || undefined}
        canSuperEditLockedFields={canSuperEditReceipts}
      />

      <IssueModal
        open={!!editingIssue}
        onClose={() => setEditingIssue(null)}
        materials={stock.materials}
        lotBalances={stock.lotBalances}
        products={stock.products}
        onIssuePosted={handleIssuePosted}
        createdBy={auth.me?.username || ""}
        mode="edit"
        initial={editingIssue || undefined}
        canSuperEditLockedFields={canSuperEditIssues}
        canApproveRejectedBatch={canApproveRejectedBatch}
        canRecordCancelledBmr={canRecordCancelledBmr}
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
