// src/utils/api.ts

const TOKEN_KEY = "sc_jwt";
export const LAST_ACTIVITY_KEY = "sc_last_human_activity";
export const AUTH_EXPIRED_EVENT = "sc_auth_expired";

function normalizeBase(base: string): string {
  // Keep leading slash (for relative bases) but remove trailing slashes
  return base.replace(/\/+$/, "");
}

function getApiBase(): string {
  // Prefer explicit override if provided
  const envBase = import.meta.env?.VITE_API_BASE as string | undefined;
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
  // Authentication is intentionally browser-session-only. Browser password
  // managers remain free to save credentials independently.
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function getToken(): string | null {
  // Never migrate the legacy persistent token: upgrading must require a fresh
  // login and closing the browser must not leave an application token behind.
  localStorage.removeItem(TOKEN_KEY);
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(LAST_ACTIVITY_KEY);
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;

  // If caller passes full URL, respect it.
  const url = path.startsWith("http") ? path : `${base}${p}`;

  const token = getToken();
  const headers = new Headers(init.headers || {});

  // Only set JSON content-type if we’re sending a body and caller didn’t already set one.
  if (!headers.has("Content-Type") && init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    let message = `HTTP ${res.status} ${res.statusText}`;
    try {
      const txt = await res.text();
      if (txt) {
        try {
          const parsed = JSON.parse(txt) as { detail?: unknown; message?: unknown };
          const detail = typeof parsed?.detail === "string" ? parsed.detail : undefined;
          const responseMessage = typeof parsed?.message === "string" ? parsed.message : undefined;
          message = detail || responseMessage || message;
        } catch {
          message = txt;
        }
      }
    } catch {
      // ignore
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    if (res.status === 401 && token && getToken() === token) {
      clearToken();
      window.dispatchEvent(
        new CustomEvent(AUTH_EXPIRED_EVENT, {
          detail: { message },
        })
      );
    }
    throw err;
  }

  return res;
}

export async function login(username: string, password: string) {
  const res = await apiFetch("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  const data = (await res.json()) as {
    access_token: string;
    token_type: string;
    must_change_password: boolean;
  };
  setToken(data.access_token);
  return data;
}

export async function changePassword(newPassword: string) {
  const res = await apiFetch("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ new_password: newPassword }),
  });
  const data = (await res.json()) as {
    access_token: string;
    token_type: string;
    must_change_password: boolean;
  };
  setToken(data.access_token);
  return data;
}

export async function recordHumanActivity() {
  await apiFetch("/auth/activity", { method: "POST" });
}

export async function logoutSession() {
  await apiFetch("/auth/logout", { method: "POST" });
}

export async function fetchSessionSettings() {
  const res = await apiFetch("/auth/session-settings");
  return (await res.json()) as {
    inactivity_timeout_minutes: number;
    updated_at?: string | null;
    updated_by?: string | null;
  };
}

export async function fetchMe() {
  const res = await apiFetch("/auth/me/");
  return (await res.json()) as {
    id: number;
    username: string;
    role: string;
    is_active: boolean;
    must_change_password: boolean;
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
