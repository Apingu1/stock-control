export async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  if (!res.ok) {
    const text = await res.text();
    console.error("API error on", path, res.status, text);
    throw new Error(`HTTP ${res.status}: ${text || "No body"}`);
  }
  return res;
}
