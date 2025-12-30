// src/utils/api.ts

const TOKEN_KEY = "sc_jwt";

function normalizeBase(base: string): string {
  return base.replace(/\/+$/, "");
}

function getApiBase(): string {
  const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (envBase && envBase.trim().length > 0) return normalizeBase(envBase.trim());

  if (typeof window !== "undefined") {
    const host = window.location.hostname || "localhost";
    const protocol = window.location.protocol || "http:";

    if (host.endsWith(".app.github.dev")) {
      const apiHost = host.replace(/-5173\.app\.github\.dev$/, "-8080.app.github.dev");
      return normalizeBase(`${protocol}//${apiHost}/api`);
    }

    return normalizeBase(`http://${host}:8080/api`);
  }

  return "http://localhost:8080/api";
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
  const url = path.startsWith("http") ? path : `${base}${p}`;

  const token = getToken();
  const headers = new Headers(init.headers || {});

  if (!headers.has("Content-Type") && init.body) {
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

// ✅ NEW: Audit events feed
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
