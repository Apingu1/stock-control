import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LotBalance, Material } from "../../types";
import {
  fetchAlertActions,
  upsertAlertAction,
  deleteAlertAction,
  pruneAlertActions,
} from "../../utils/api";

import type {
  AlertAction,
  AlertState,
  LowExpiryRow,
  LowExpirySortMode,
  LowStockRow,
  LowStockSortMode,
  ParsedKey,
  UpsertMeta,
} from "./alertsTypes";

import {
  FILTER_STATE_OPTIONS,
  STATE_OPTIONS,
  getCategoryOptions,
  getTypeOptions,
  stateBadgeKind,
  statePriority,
} from "./alertsTypes";

import {
  computeDaysToAQ,
  keyLowExpiry,
  keyLowStock,
  loadActions,
  nowIso,
  parseKey,
  safeNum,
  saveActions,
} from "./alertsStore";

import { badge, stateLabel } from "./alertsUi";
import LowStockPanel from "./LowStockPanel";
import LowExpiryPanel from "./LowExpiryPanel";
import SuppressedModal from "./SuppressedModal";
import type { SuppressedRow } from "./SuppressedModal";

type Props = {
  materials: Material[];
  lotBalances: LotBalance[];
};

const LowStockExpiryView: React.FC<Props> = ({ materials, lotBalances }) => {
  const [q, setQ] = useState("");
  const [actionsLoaded, setActionsLoaded] = useState(false);
  const [actions, setActions] = useState<Record<string, AlertAction>>({});
  const [showSuppressed, setShowSuppressed] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<"ALL" | Exclude<AlertState, "NOT_REQUIRED">>(
    "ALL"
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  // Sorting
  const [lowStockSort, setLowStockSort] = useState<LowStockSortMode>("SEVERITY");
  const [lowExpirySort, setLowExpirySort] = useState<LowExpirySortMode>("SOONEST_AQ");

  // ETA draft state (avoid request-per-keystroke)
  const [etaDraft, setEtaDraft] = useState<Record<string, string>>({});
  const etaTimersRef = useRef<Record<string, number>>({});

  // Prune debounce
  const pruneTimerRef = useRef<number | null>(null);

  // Load local immediately (fast UI), then hydrate from API (authoritative)
  useEffect(() => {
    const local = loadActions();
    setActions(local);

    (async () => {
      try {
        const rows = await fetchAlertActions({ include_not_required: true });

        const map: Record<string, AlertAction> = {};
        for (const r of rows) {
          map[r.alert_key] = {
            state: r.state,
            eta_text: r.eta_text ?? undefined,
            updated_at: r.updated_at,
            last_seen_available_qty: r.last_seen_available_qty ?? undefined,
          };
        }

        setActions(map);
        saveActions(map); // keep sidebar badge logic compatible
      } catch (e) {
        console.error("Failed to load alert actions from API, using localStorage fallback:", e);
      } finally {
        setActionsLoaded(true);
        try {
          window.dispatchEvent(new CustomEvent("sc_alert_actions_changed"));
        } catch {
          // ignore
        }
      }
    })();
  }, []);

  const upsertAction = async (key: string, patch: Partial<AlertAction>, meta: UpsertMeta) => {
    // optimistic UI
    setActions((prev) => {
      const cur = prev[key] ?? { state: "NEW" as AlertState };
      const next: AlertAction = { ...cur, ...patch, updated_at: nowIso() };
      const merged = { ...prev, [key]: next };
      saveActions(merged);
      return merged;
    });

    try {
      const current = actions[key] ?? { state: "NEW" as AlertState };
      const state = (patch.state ?? current.state ?? "NEW") as AlertState;

      await upsertAlertAction({
        alert_key: key,
        alert_type: meta.alert_type,
        material_code: meta.material_code,
        lot_number: meta.lot_number ?? null,
        state,
        eta_text: patch.eta_text ?? current.eta_text ?? null,
        last_seen_available_qty:
          patch.last_seen_available_qty ??
          meta.last_seen_available_qty ??
          current.last_seen_available_qty ??
          null,
      });
    } catch (e) {
      console.error("Failed to save alert action to API:", e);
      alert("Failed to save alert update. Please try again.");
      // reload authoritative
      try {
        const rows = await fetchAlertActions({ include_not_required: true });
        const map: Record<string, AlertAction> = {};
        for (const r of rows) {
          map[r.alert_key] = {
            state: r.state,
            eta_text: r.eta_text ?? undefined,
            updated_at: r.updated_at,
            last_seen_available_qty: r.last_seen_available_qty ?? undefined,
          };
        }
        setActions(map);
        saveActions(map);
      } catch {
        // ignore
      }
    }
  };

  const removeAction = async (key: string) => {
    // optimistic UI
    setActions((prev) => {
      const next = { ...prev };
      delete next[key];
      saveActions(next);
      return next;
    });

    try {
      await deleteAlertAction(key);
    } catch (e) {
      console.error("Failed to delete alert action:", e);
      alert("Failed to delete alert entry. Please try again.");
    }
  };

  const availableQtyByMaterial = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of lotBalances as any[]) {
      if (String(r.status).toUpperCase() !== "AVAILABLE") continue;
      const code = String(r.material_code);
      m.set(code, (m.get(code) ?? 0) + safeNum((r as any).balance_qty));
    }
    return m;
  }, [lotBalances]);

  const materialByCode = useMemo(() => {
    const m = new Map<string, Material>();
    for (const mat of materials) m.set(String(mat.material_code), mat);
    return m;
  }, [materials]);

  const categoryOptions = useMemo(() => getCategoryOptions(materials), [materials]);
  const typeOptions = useMemo(() => getTypeOptions(materials), [materials]);

  // --- Active alert keys (for pruning) -------------------------------------
  const activeLowStockKeys = useMemo(() => {
    const keys: string[] = [];
    for (const mat of materials as any[]) {
      const thrRaw = mat.low_stock_threshold_qty;
      if (thrRaw === null || thrRaw === undefined) continue;

      const code = String(mat.material_code);
      const thr = safeNum(thrRaw);
      const avail = availableQtyByMaterial.get(code) ?? 0;
      if (avail <= thr) keys.push(keyLowStock(code));
    }
    return keys;
  }, [materials, availableQtyByMaterial]);

  const activeLowExpiryKeys = useMemo(() => {
    const keys: string[] = [];
    for (const r of lotBalances as any[]) {
      if (String(r.status).toUpperCase() !== "AVAILABLE") continue;
      const qty = safeNum(r.balance_qty);
      if (qty <= 0) continue;
      if (!r.expiry_date) continue;

      const code = String(r.material_code);
      const lot = String(r.lot_number);
      const mat: any = materialByCode.get(code);
      if (!mat) continue;

      const alertDays = mat.expiry_alert_days;
      if (alertDays === null || alertDays === undefined) continue;

      const dte = r.days_to_expiry;
      if (dte === null || dte === undefined) continue;
      if (safeNum(dte) > safeNum(alertDays)) continue;

      keys.push(keyLowExpiry(code, lot));
    }
    return keys;
  }, [lotBalances, materialByCode]);

  const activeKeys = useMemo(() => {
    const s = new Set<string>();
    for (const k of activeLowStockKeys) s.add(k);
    for (const k of activeLowExpiryKeys) s.add(k);
    return Array.from(s).sort();
  }, [activeLowStockKeys, activeLowExpiryKeys]);

  // --- Prune resolved action rows ------------------------------------------
  useEffect(() => {
    if (!actionsLoaded) return;

    if (pruneTimerRef.current) window.clearTimeout(pruneTimerRef.current);
    pruneTimerRef.current = window.setTimeout(() => {
      void pruneAlertActions(activeKeys).catch((e) => {
        // best-effort / fire-and-forget
        console.warn("Alert prune failed (non-fatal):", e);
      });
    }, 1000);

    return () => {
      if (pruneTimerRef.current) window.clearTimeout(pruneTimerRef.current);
    };
  }, [activeKeys, actionsLoaded]);

  const lowStockRows = useMemo(() => {
    const out: LowStockRow[] = [];
    const query = q.trim().toLowerCase();

    for (const mat of materials as any[]) {
      const thrRaw = mat.low_stock_threshold_qty;
      if (thrRaw === null || thrRaw === undefined) continue;

      const code = String(mat.material_code);
      const name = String(mat.name ?? "");
      const category = String(mat.category_code ?? "");
      const type = String(mat.type_code ?? "");
      const uom = String(mat.base_uom_code ?? "");
      const avail = availableQtyByMaterial.get(code) ?? 0;
      const thr = safeNum(thrRaw);

      if (avail > thr) continue;

      const key = keyLowStock(code);
      const action = actions[key] ?? { state: "NEW" as AlertState };

      // suppressed
      if (action.state === "NOT_REQUIRED") continue;

      // Filters
      if (statusFilter !== "ALL" && action.state !== statusFilter) continue;
      if (categoryFilter !== "ALL" && category !== categoryFilter) continue;
      if (typeFilter !== "ALL" && type !== typeFilter) continue;

      // Search
      if (query) {
        const hay = `${code} ${name} ${category} ${type}`.toLowerCase();
        if (!hay.includes(query)) continue;
      }

      const sev: "warn" | "critical" = thr > 0 && avail <= thr * 0.5 ? "critical" : "warn";

      out.push({
        key,
        material_code: code,
        name,
        category_code: category,
        type_code: type,
        base_uom_code: uom,
        available_qty: avail,
        threshold_qty: thr,
        severity: sev,
        action,
      });
    }

    const sortMaterial = (a: LowStockRow, b: LowStockRow) =>
      a.material_code.localeCompare(b.material_code);

    out.sort((a, b) => {
      if (lowStockSort === "MATERIAL") return sortMaterial(a, b);

      if (lowStockSort === "STATUS_PRIORITY") {
        const pa = statePriority(a.action.state);
        const pb = statePriority(b.action.state);
        if (pa !== pb) return pa - pb;
        if (a.available_qty !== b.available_qty) return a.available_qty - b.available_qty;
        return sortMaterial(a, b);
      }

      if (lowStockSort === "LOWEST_AVAILABLE") {
        if (a.available_qty !== b.available_qty) return a.available_qty - b.available_qty;
        const pa = statePriority(a.action.state);
        const pb = statePriority(b.action.state);
        if (pa !== pb) return pa - pb;
        return sortMaterial(a, b);
      }

      // Default: SEVERITY
      if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
      if (a.available_qty !== b.available_qty) return a.available_qty - b.available_qty;
      const pa = statePriority(a.action.state);
      const pb = statePriority(b.action.state);
      if (pa !== pb) return pa - pb;
      return sortMaterial(a, b);
    });

    return out;
  }, [
    materials,
    availableQtyByMaterial,
    actions,
    q,
    statusFilter,
    categoryFilter,
    typeFilter,
    lowStockSort,
  ]);

  const lowExpiryRows = useMemo(() => {
    const out: LowExpiryRow[] = [];
    const query = q.trim().toLowerCase();

    for (const r of lotBalances as any[]) {
      if (String(r.status).toUpperCase() !== "AVAILABLE") continue;
      const qty = safeNum(r.balance_qty);
      if (qty <= 0) continue;
      if (!r.expiry_date) continue;

      const code = String(r.material_code);
      const lot = String(r.lot_number);
      const mat: any = materialByCode.get(code);
      if (!mat) continue;

      const alertDays = mat.expiry_alert_days;
      if (alertDays === null || alertDays === undefined) continue;

      const dte = r.days_to_expiry;
      if (dte === null || dte === undefined) continue;
      if (safeNum(dte) > safeNum(alertDays)) continue;

      const key = keyLowExpiry(code, lot);
      const action = actions[key] ?? { state: "NEW" as AlertState };

      // suppressed
      if (action.state === "NOT_REQUIRED") continue;

      const name = String(mat.name ?? "");
      const category = String(mat.category_code ?? "");
      const type = String(mat.type_code ?? "");

      // Filters
      if (statusFilter !== "ALL" && action.state !== statusFilter) continue;
      if (categoryFilter !== "ALL" && category !== categoryFilter) continue;
      if (typeFilter !== "ALL" && type !== typeFilter) continue;

      // Search
      if (query) {
        const hay = `${code} ${name} ${lot}`.toLowerCase();
        if (!hay.includes(query)) continue;
      }

      const exp = String(r.expiry_date);
      const daysToExpiry = safeNum(dte);
      const daysToAQ = computeDaysToAQ(r);

      const sev: "warn" | "critical" = daysToExpiry <= 7 ? "critical" : "warn";

      out.push({
        key,
        material_code: code,
        name,
        category_code: category,
        type_code: type,
        lot_number: lot,
        expiry_date: exp,
        days_to_expiry: daysToExpiry,
        alert_days: safeNum(alertDays),
        days_to_quarantine: daysToAQ,
        qty,
        severity: sev,
        action,
      });
    }

    const sortMaterial = (a: LowExpiryRow, b: LowExpiryRow) =>
      a.material_code.localeCompare(b.material_code);

    out.sort((a, b) => {
      if (lowExpirySort === "MATERIAL") {
        const m = sortMaterial(a, b);
        if (m !== 0) return m;
        return a.lot_number.localeCompare(b.lot_number);
      }

      if (lowExpirySort === "STATUS_PRIORITY") {
        const pa = statePriority(a.action.state);
        const pb = statePriority(b.action.state);
        if (pa !== pb) return pa - pb;
        const aqA = a.days_to_quarantine ?? 999999;
        const aqB = b.days_to_quarantine ?? 999999;
        if (aqA !== aqB) return aqA - aqB;
        if (a.days_to_expiry !== b.days_to_expiry) return a.days_to_expiry - b.days_to_expiry;
        const m = sortMaterial(a, b);
        if (m !== 0) return m;
        return a.lot_number.localeCompare(b.lot_number);
      }

      if (lowExpirySort === "SOONEST_EXPIRY") {
        if (a.days_to_expiry !== b.days_to_expiry) return a.days_to_expiry - b.days_to_expiry;
        const aqA = a.days_to_quarantine ?? 999999;
        const aqB = b.days_to_quarantine ?? 999999;
        if (aqA !== aqB) return aqA - aqB;
        const pa = statePriority(a.action.state);
        const pb = statePriority(b.action.state);
        if (pa !== pb) return pa - pb;
        const m = sortMaterial(a, b);
        if (m !== 0) return m;
        return a.lot_number.localeCompare(b.lot_number);
      }

      // Default: SOONEST_AQ
      const aqA = a.days_to_quarantine ?? 999999;
      const aqB = b.days_to_quarantine ?? 999999;
      if (aqA !== aqB) return aqA - aqB;
      if (a.days_to_expiry !== b.days_to_expiry) return a.days_to_expiry - b.days_to_expiry;
      if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
      const pa = statePriority(a.action.state);
      const pb = statePriority(b.action.state);
      if (pa !== pb) return pa - pb;
      const m = sortMaterial(a, b);
      if (m !== 0) return m;
      return a.lot_number.localeCompare(b.lot_number);
    });

    return out;
  }, [
    lotBalances,
    materialByCode,
    actions,
    q,
    statusFilter,
    categoryFilter,
    typeFilter,
    lowExpirySort,
  ]);

  // Keep low-stock last_seen qty fresh (optional)
  useEffect(() => {
    if (!actionsLoaded) return;

    setActions((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const mat of materials as any[]) {
        const thrRaw = mat.low_stock_threshold_qty;
        if (thrRaw === null || thrRaw === undefined) continue;
        const code = String(mat.material_code);
        const key = keyLowStock(code);

        const act = next[key];
        if (!act) continue;

        const avail = availableQtyByMaterial.get(code) ?? 0;
        if (act.last_seen_available_qty !== avail) {
          next[key] = { ...act, last_seen_available_qty: avail };
          changed = true;
        }
      }

      if (changed) saveActions(next);
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, availableQtyByMaterial, actionsLoaded]);

  const flushEtaDraft = (k: string, meta: UpsertMeta) => {
    const val = etaDraft[k];
    if (val === undefined) return;
    void upsertAction(k, { eta_text: val }, meta);
  };

  const renderMgmtCell = (k: string, act: AlertAction, meta: UpsertMeta) => {
    const onChangeState = (nextState: AlertState) => {
      if (nextState === "NOT_REQUIRED" && act.state !== "NOT_REQUIRED") {
        const ok = window.confirm(
          "Do you really want to set this alert to 'Not required'?\n\nThis will remove it from the alert list until manually undone."
        );
        if (!ok) return;
      }
      void upsertAction(k, { state: nextState }, meta);
    };

    const draftVal = etaDraft[k] ?? act.eta_text ?? "";

    const scheduleDebouncedSave = () => {
      if (etaTimersRef.current[k]) window.clearTimeout(etaTimersRef.current[k]);
      etaTimersRef.current[k] = window.setTimeout(() => {
        flushEtaDraft(k, meta);
      }, 650);
    };

    const bgKind = stateBadgeKind(act.state);

    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <select
          className="input"
          style={{ height: 34, width: 160, fontSize: 13 }}
          value={act.state}
          onChange={(e) => onChangeState(e.target.value as AlertState)}
        >
          {STATE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <input
          className="input"
          style={{ height: 34, width: 220, fontSize: 13 }}
          placeholder="ETA / due date (text)…"
          value={draftVal}
          onChange={(e) => {
            const next = e.target.value;
            setEtaDraft((prev) => ({ ...prev, [k]: next }));
            scheduleDebouncedSave();
          }}
          onBlur={() => flushEtaDraft(k, meta)}
        />

        {badge(stateLabel(act.state), bgKind)}
      </div>
    );
  };

  const suppressed = useMemo<SuppressedRow[]>(() => {
    if (!actionsLoaded) return [];
    const out: SuppressedRow[] = [];
    for (const [k, v] of Object.entries(actions)) {
      if (v?.state !== "NOT_REQUIRED") continue;
      out.push({ key: k, info: parseKey(k), action: v });
    }
    out.sort((a, b) => {
      if (a.info.type !== b.info.type) return a.info.type.localeCompare(b.info.type);
      if (a.info.material !== b.info.material) return a.info.material.localeCompare(b.info.material);
      return (a.info.lot ?? "").localeCompare(b.info.lot ?? "");
    });
    return out;
  }, [actions, actionsLoaded]);

  const totalFlagged = lowStockRows.length + lowExpiryRows.length;

  if (!actionsLoaded) {
    return (
      <div className="page">
        <div className="page-header" style={{ gap: 10 }}>
          <div />
          <div className="muted" style={{ fontSize: 13 }}>
            Loading alerts…
          </div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-header">
            <div style={{ fontSize: 16, fontWeight: 700 }}>Low Stock</div>
          </div>
          <div style={{ padding: 16 }} className="muted">
            Preparing view…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header" style={{ gap: 10 }}>
        <div />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowSuppressed(true)}
            disabled={suppressed.length === 0}
          >
            Manage suppressed ({suppressed.length})
          </button>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search material / lot..."
            className="input"
            style={{ width: 260, height: 36, fontSize: 13 }}
          />

          <select
            className="input"
            style={{ width: 170, height: 36, fontSize: 13 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            title="Filter by status"
          >
            {FILTER_STATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            className="input"
            style={{ width: 150, height: 36, fontSize: 13 }}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            title="Filter by category"
          >
            <option value="ALL">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="input"
            style={{ width: 150, height: 36, fontSize: 13 }}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            title="Filter by type"
          >
            <option value="ALL">All types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {badge(`Total: ${totalFlagged}`, totalFlagged > 0 ? "warn" : "neutral")}
        </div>
      </div>

      <LowStockPanel
        rows={lowStockRows}
        sortMode={lowStockSort}
        setSortMode={setLowStockSort}
        renderMgmtCell={renderMgmtCell}
      />

      <LowExpiryPanel
        rows={lowExpiryRows}
        sortMode={lowExpirySort}
        setSortMode={setLowExpirySort}
        renderMgmtCell={renderMgmtCell}
      />

      <SuppressedModal
        open={showSuppressed}
        suppressed={suppressed}
        onClose={() => setShowSuppressed(false)}
        onUndo={(k: string, info: ParsedKey) =>
          void upsertAction(
            k,
            { state: "NEW" },
            {
              alert_type: info.type,
              material_code: info.material,
              lot_number: info.type === "LOW_EXPIRY" ? info.lot ?? null : null,
              last_seen_available_qty: null,
            }
          )
        }
        onDelete={(k: string) => void removeAction(k)}
      />
    </div>
  );
};

export default LowStockExpiryView;
