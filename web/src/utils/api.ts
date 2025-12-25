// src/utils/api.ts

const TOKEN_KEY = "sc_jwt";

function normalizeBase(base: string): string {
  // remove trailing slash
  return base.replace(/\/+$/, "");
}

function getApiBase(): string {
  // Prefer explicit env (recommended):
  // VITE_API_BASE="http://localhost:8080/api"
  const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (envBase && envBase.trim().length > 0) return normalizeBase(envBase.trim());

  if (typeof window !== "undefined") {
    const host = window.location.hostname || "localhost";
    const protocol = window.location.protocol || "http:";

    // Codespaces Vite host like:
    //   <name>-5173.app.github.dev
    // nginx is:
    //   <name>-8080.app.github.dev
    if (host.endsWith(".app.github.dev")) {
      const apiHost = host.replace(/-5173\.app\.github\.dev$/, "-8080.app.github.dev");
      return normalizeBase(`${protocol}//${apiHost}/api`);
    }

    // Local dev: prefer nginx gateway on 8080 with /api
    // (Your nginx is already set up to rewrite /api/* to FastAPI)
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

  // ensure path starts with /
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

// Phase B: permissions for logged-in user
export async function fetchMyPermissions() {
  const res = await apiFetch("/auth/my-permissions");
  return (await res.json()) as {
    role: string;
    permissions: string[];
  };
}
