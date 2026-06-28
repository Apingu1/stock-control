// src/utils/api.ts

const TOKEN_KEY = "sc_jwt";

function normalizeBase(base: string): string {
  // Keep leading slash (for relative bases) but remove trailing slashes
  return base.replace(/\/+$/, "");
}

function getApiBase(): string {
  // Prefer explicit override if provided
  const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (envBase && envBase.trim().length > 0) {
    return normalizeBase(envBase.trim());
  }

  /**
   * Default: SAME ORIGIN.
   * - In production (served by nginx on :8080): "/api" works directly.
   * - In dev (vite :5173): "/api" must be proxied to the backend (vite.config proxy).
   *
   * This avoids cross-origin calls and the CORS preflight failures you’re seeing.
   */
  return "/api";
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;

  // If caller passes full URL, respect it.
  const url = path.startsWith("http") ? path : `${base}${p}`;

  const token = getToken();
  const headers = new Headers(init.headers || {});

  // Only set JSON content-type if we’re sending a body and caller didn’t already set one.
  if (!headers.has("Content-Type") && init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    let detail = "";
    try {
      const txt = await res.text();
      detail = txt ? ` — ${txt}` : "";
    } catch {
      // ignore
    }
    const err = new Error(`HTTP ${res.status} ${res.statusText}${detail}`);
    (err as any).status = res.status;
    throw err;
  }

  return res;
}

export async function login(username: string, password: string) {
  const res = await apiFetch("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  const data = (await res.json()) as { access_token: string; token_type: string };
  setToken(data.access_token);
  return data;
}

export async function fetchMe() {
  const res = await apiFetch("/auth/me/");
  return (await res.json()) as {
    id: number;
    username: string;
    role: string;
    is_active: boolean;
  };
}

export async function fetchMyPermissions() {
  const res = await apiFetch("/auth/my-permissions");
  return (await res.json()) as {
    role: string;
    permissions: string[];
  };
}

// ✅ Audit events feed
export async function fetchAuditEvents(params: {
  date_from?: string;
  date_to?: string;
  event_type?: string;
  actor_username?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params.date_from) qs.set("date_from", params.date_from);
  if (params.date_to) qs.set("date_to", params.date_to);
  if (params.event_type) qs.set("event_type", params.event_type);
  if (params.actor_username) qs.set("actor_username", params.actor_username);
  if (params.q) qs.set("q", params.q);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));

  const res = await apiFetch(`/audit/events?${qs.toString()}`);
  return await res.json();
}

/* -------------------------------------------------------------------------- */
/* Alerts (Phase D4+: server-side persistence)                                */
/* -------------------------------------------------------------------------- */

export type AlertActionRow = {
  id: number;
  alert_key: string;
  alert_type: "LOW_STOCK" | "LOW_EXPIRY";
  material_code: string;
  lot_number?: string | null;
  state: "NEW" | "ACKNOWLEDGED" | "ON_ORDER" | "DELAYED" | "UNAVAILABLE" | "NOT_REQUIRED";
  eta_text?: string | null;
  last_seen_available_qty?: number | null;
  created_at: string;
  updated_at: string;
  updated_by?: string | null;
};

export async function fetchAlertActions(opts?: { include_not_required?: boolean }) {
  const qs = new URLSearchParams();
  if (opts?.include_not_required === false) qs.set("include_not_required", "false");
  const res = await apiFetch(`/alerts/actions?${qs.toString()}`);
  return (await res.json()) as AlertActionRow[];
}

export async function upsertAlertAction(row: {
  alert_key: string;
  alert_type: "LOW_STOCK" | "LOW_EXPIRY";
  material_code: string;
  lot_number?: string | null;
  state: "NEW" | "ACKNOWLEDGED" | "ON_ORDER" | "DELAYED" | "UNAVAILABLE" | "NOT_REQUIRED";
  eta_text?: string | null;
  last_seen_available_qty?: number | null;
}) {
  const res = await apiFetch("/alerts/actions", {
    method: "POST",
    body: JSON.stringify(row),
  });
  return (await res.json()) as AlertActionRow;
}

export async function deleteAlertAction(alert_key: string) {
  const qs = new URLSearchParams();
  qs.set("alert_key", alert_key);
  const res = await apiFetch(`/alerts/actions?${qs.toString()}`, { method: "DELETE" });
  return (await res.json()) as { ok: boolean };
}

// Space-saving: prune resolved alert action rows (keeps NOT_REQUIRED suppressions)
export async function pruneAlertActions(active_keys: string[]) {
  const res = await apiFetch("/alerts/prune", {
    method: "POST",
    body: JSON.stringify(active_keys ?? []),
  });
  return (await res.json()) as { ok: boolean; deleted: number };
}

// --- Admin DB Tools ----------------------------------------------------------

export async function fetchDbSystemInfo() {
  const res = await apiFetch("/admin/db-tools/system-info");
  return await res.json();
}

export async function listDbBackups() {
  const res = await apiFetch("/admin/db-tools/backups");
  return await res.json();
}

export async function createDbBackupNow() {
  const res = await apiFetch("/admin/db-tools/backup", { method: "POST" });
  return await res.json();
}