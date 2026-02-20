import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api";
import { formatDate } from "../../utils/format";

type TabKey = "thresholds" | "log";

type ExpiryThresholdRow = {
  id: number;
  category_code: string;
  type_code: string;
  threshold_days: number;
  is_active: boolean;
  updated_at: string;
  updated_by?: string | null;
};

type QuarantinePolicy = {
  allow_issue_from_quarantine: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
};

type QuarantineLogRow = {
  id: string; // stable key for UI (uuid-like string)
  event_at: string;
  event_type: "STATUS_CHANGE" | "DESTRUCTION";
  material_code: string;

  // backend may send either "material_name" (frontend) or "name" (backend schema)
  material_name?: string | null;
  name?: string | null;

  lot_number: string;

  // backend may send Decimal as string
  qty: number | string | null;
  uom_code?: string | null;

  from_status?: string | null;
  to_status?: string | null;
  reason?: string | null;
  created_by?: string | null;

  // helpful links/debug (optional)
  source_material_lot_id?: number | null;
  dest_material_lot_id?: number | null;
  source?: string | null; // RECORDED / DERIVED (kept for compatibility; UI column removed)
};

function formatDateTime(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  const dd = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
  const tt = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${dd} ${tt}`;
}

function parseQty(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // handle Decimal strings like "1.000000"
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ADDITIVE: download helper for CSV/PDF
function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function QuarantineView(props: { isAdmin: boolean; hasPerm: (k: string) => boolean }) {
  const { isAdmin, hasPerm } = props;

  const canView = hasPerm("lots.status_change") || isAdmin;
  const [tab, setTab] = useState<TabKey>("thresholds");

  useEffect(() => {
    if (!canView) setTab("thresholds");
  }, [canView]);

  return (
    <section className="content" style={{ minHeight: 0 }}>
      <section className="card" style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div className="card-header">
          <div>
            <div className="card-title">Quarantine</div>
            <div className="card-subtitle">
              Auto-quarantine thresholds (policy) and the quarantine activity log (status changes + destruction issues).
            </div>
          </div>

          <div className="card-actions" style={{ gap: 8 }}>
            <button
              type="button"
              className={"btn " + (tab === "thresholds" ? "btn-primary" : "btn-ghost")}
              onClick={() => setTab("thresholds")}
            >
              Thresholds
            </button>
            <button
              type="button"
              className={"btn " + (tab === "log" ? "btn-primary" : "btn-ghost")}
              onClick={() => setTab("log")}
              disabled={!canView}
              title={!canView ? "You do not have permission to view quarantine logs." : ""}
            >
              Quarantine Log
            </button>
          </div>
        </div>

        <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto" }}>
          {tab === "thresholds" && <ThresholdsTab isAdmin={isAdmin} />}
          {tab === "log" && <LogTab canView={canView} />}
        </div>
      </section>
    </section>
  );
}

function ThresholdsTab(props: { isAdmin: boolean }) {
  const { isAdmin } = props;

  const [rows, setRows] = useState<ExpiryThresholdRow[]>([]);
  const [policy, setPolicy] = useState<QuarantinePolicy | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.category_code !== b.category_code) return a.category_code.localeCompare(b.category_code);
      return a.type_code.localeCompare(b.type_code);
    });
  }, [rows]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      // Admin-managed thresholds (full list including inactive rows)
      const res = await apiFetch("/admin/expiry-thresholds");
      const data = (await res.json()) as ExpiryThresholdRow[];
      setRows(Array.isArray(data) ? data : []);

      // Quarantine policy toggle (admin)
      try {
        const pRes = await apiFetch("/quarantine/policy");
        const pData = (await pRes.json()) as QuarantinePolicy;
        setPolicy(pData);
      } catch {
        setPolicy(null);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load quarantine thresholds");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function saveRow(id: number, patch: Partial<Pick<ExpiryThresholdRow, "threshold_days" | "is_active">>) {
    setSaving((p) => ({ ...p, [id]: true }));
    setError(null);
    try {
      const res = await apiFetch(`/admin/expiry-thresholds/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      const updated = (await res.json()) as ExpiryThresholdRow;
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (e: any) {
      setError(e?.message || "Failed to save threshold");
    } finally {
      setSaving((p) => ({ ...p, [id]: false }));
    }
  }

  async function savePolicy(next: boolean) {
    setSavingPolicy(true);
    setError(null);
    try {
      const res = await apiFetch("/quarantine/policy", {
        method: "PUT",
        body: JSON.stringify({ allow_issue_from_quarantine: next }),
      });
      const updated = (await res.json()) as QuarantinePolicy;
      setPolicy(updated);
    } catch (e: any) {
      setError(e?.message || "Failed to save policy");
    } finally {
      setSavingPolicy(false);
    }
  }

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      {error && <div className="error-row">{error}</div>}

      <div className="info-row" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, opacity: 0.9 }}>
          These thresholds control when the system auto-quarantines <b>AVAILABLE</b> lots due to low expiry.
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={loadAll} disabled={loading} className="btn" type="button">
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="card-header">
          <div>
            <div className="card-title" style={{ fontSize: 14 }}>Quarantine policy</div>
            <div className="card-subtitle">Controls whether quarantined material can be issued (warn vs block).</div>
          </div>
        </div>

        {!isAdmin && (
          <div className="info-row" style={{ fontSize: 12, opacity: 0.85 }}>
            You do not have admin access to change policy settings.
          </div>
        )}

        <div className="info-row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={policy?.allow_issue_from_quarantine ?? true}
              disabled={!isAdmin || savingPolicy}
              onChange={(e) => void savePolicy(e.target.checked)}
            />
            <span style={{ fontSize: 12 }}>
              Allow issuing from <b>QUARANTINE</b> lots (warn-only)
            </span>
          </label>

          <span className={policy?.allow_issue_from_quarantine ? "tag tag-warn" : "tag tag-danger"} style={{ fontSize: 11 }}>
            {policy?.allow_issue_from_quarantine ? "Allowed (warn)" : "Blocked"}
          </span>

          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
            Updated: {formatDate(policy?.updated_at ?? null)} {policy?.updated_by ? `by ${policy.updated_by}` : ""}
          </span>
        </div>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="card-header">
          <div>
            <div className="card-title" style={{ fontSize: 14 }}>Auto-quarantine thresholds</div>
            <div className="card-subtitle">
              Category/type default thresholds used by auto-quarantine evaluation.
            </div>
          </div>
        </div>

        {loading && <div className="info-row">Loading thresholds…</div>}

        {!loading && (
          <div className="table-wrapper" style={{ maxHeight: 560, overflowY: "auto" }}>
            <table className="table">
              <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#050816" }}>
                <tr>
                  <th style={{ width: 220 }}>Category</th>
                  <th style={{ width: 220 }}>Type</th>
                  <th className="numeric" style={{ width: 160 }}>Threshold (days)</th>
                  <th style={{ width: 120 }}>Active</th>
                  <th style={{ width: 140 }}>Updated</th>
                  <th style={{ width: 160 }}>Updated By</th>
                  <th style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-row">No threshold rows found.</td>
                  </tr>
                )}

                {sorted.map((r) => {
                  const isSaving = !!saving[r.id];
                  const disabled = !isAdmin || isSaving;

                  return (
                    <tr key={r.id}>
                      <td style={{ fontSize: 12 }}>{r.category_code}</td>
                      <td style={{ fontSize: 12 }}>{r.type_code}</td>

                      <td className="numeric">
                        <input
                          className="input"
                          style={{
                            width: 110,
                            textAlign: "right",
                            padding: "6px 10px",
                            fontSize: 12,
                            borderRadius: 999,
                          }}
                          type="number"
                          min={0}
                          value={r.threshold_days}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            setRows((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, threshold_days: Number.isFinite(next) ? next : 0 } : x
                              )
                            );
                          }}
                        />
                      </td>

                      <td>
                        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <input
                            type="checkbox"
                            checked={!!r.is_active}
                            disabled={disabled}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setRows((prev) =>
                                prev.map((x) => (x.id === r.id ? { ...x, is_active: checked } : x))
                              );
                            }}
                          />
                          <span className={r.is_active ? "tag tag-success" : "tag tag-muted"} style={{ fontSize: 11 }}>
                            {r.is_active ? "Active" : "Inactive"}
                          </span>
                        </label>
                      </td>

                      <td style={{ fontSize: 12 }}>{formatDate(r.updated_at || null)}</td>
                      <td style={{ fontSize: 12 }}>{r.updated_by || "—"}</td>

                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            borderRadius: 999,
                            minWidth: 84,
                            cursor: disabled ? "not-allowed" : "pointer",
                          }}
                          disabled={disabled}
                          onClick={() => void saveRow(r.id, { threshold_days: r.threshold_days, is_active: r.is_active })}
                          title={!isAdmin ? "Admin only" : "Save changes"}
                        >
                          {isSaving ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function LogTab(props: { canView: boolean }) {
  const { canView } = props;

  const [rows, setRows] = useState<QuarantineLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  // ADDITIVE: export UI state
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "STATUS_CHANGE" | "DESTRUCTION">("ALL");
  const [limit, setLimit] = useState(400);

  function buildParams(): URLSearchParams {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (typeFilter !== "ALL") params.set("event_type", typeFilter);
    if (q.trim()) params.set("q", q.trim());
    return params;
  }

  async function load() {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const params = buildParams();
      const res = await apiFetch(`/quarantine/log?${params.toString()}`);
      const data = (await res.json()) as QuarantineLogRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load quarantine log");
    } finally {
      setLoading(false);
    }
  }

  // ADDITIVE: export CSV
  async function exportCsv() {
    setExportingCsv(true);
    setError(null);
    try {
      const params = buildParams();
      const res = await apiFetch(`/quarantine/log.csv?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `quarantine_log_${stamp}.csv`);
    } catch (e: any) {
      setError(e?.message || "Failed to export CSV");
    } finally {
      setExportingCsv(false);
    }
  }

  // ADDITIVE: export PDF
  async function exportPdf() {
    setExportingPdf(true);
    setError(null);
    try {
      const params = buildParams();
      const res = await apiFetch(`/quarantine/log.pdf?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `quarantine_log_${stamp}.pdf`);
    } catch (e: any) {
      setError(e?.message || "Failed to export PDF");
    } finally {
      setExportingPdf(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, limit, typeFilter]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const displayName = (r.material_name ?? r.name ?? "");
      const hay = `${r.material_code} ${displayName} ${r.lot_number} ${r.reason ?? ""} ${r.created_by ?? ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [q, rows]);

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <div className="info-row" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search material / lot / user / reason…"
          className="input"
          style={{ width: 320, height: 36, fontSize: 13 }}
        />

        <select
          className="input"
          style={{ width: 180, height: 36, fontSize: 13 }}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as any)}
          title="Filter"
        >
          <option value="ALL">All events</option>
          <option value="STATUS_CHANGE">Status changes</option>
          <option value="DESTRUCTION">Destruction issues</option>
        </select>

        <select
          className="input"
          style={{ width: 160, height: 36, fontSize: 13 }}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          title="Limit"
        >
          <option value={200}>Last 200</option>
          <option value={400}>Last 400</option>
          <option value={800}>Last 800</option>
          <option value={2000}>Last 2000</option>
        </select>

        <button className="btn" type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12 }}>
            Showing {filtered.length} events
          </span>

          {/* ADDITIVE: export buttons */}
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => void exportCsv()}
            disabled={loading || exportingCsv}
            title="Export filtered log as CSV"
          >
            {exportingCsv ? "Exporting…" : "Export CSV"}
          </button>

          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => void exportPdf()}
            disabled={loading || exportingPdf}
            title="Export filtered log as printable PDF"
          >
            {exportingPdf ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>

      {error && <div className="error-row">{error}</div>}

      <div className="table-wrapper" style={{ maxHeight: 680, overflowY: "auto" }}>
        <table className="table">
          <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#050816" }}>
            <tr>
              <th style={{ width: 160 }}>When</th>
              <th style={{ width: 140 }}>Type</th>
              <th style={{ width: 130 }}>Material</th>
              <th>Material name</th>
              <th style={{ width: 140 }}>Lot</th>
              <th className="numeric" style={{ width: 130 }}>Qty</th>
              <th style={{ width: 160 }}>From → To</th>
              <th style={{ width: 240 }}>Reason / Comment</th>
              <th style={{ width: 140 }}>Who</th>
              {/* Src column removed */}
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="empty-row">No quarantine events found.</td>
              </tr>
            )}

            {filtered.map((r) => {
              const fromTo =
                r.event_type === "DESTRUCTION"
                  ? `${r.from_status ?? "—"} → DESTROYED`
                  : `${r.from_status ?? "—"} → ${r.to_status ?? "—"}`;

              const displayName = r.material_name ?? r.name ?? "—";
              const qn = parseQty(r.qty);

              return (
                <tr key={r.id}>
                  <td style={{ fontSize: 12 }}>{formatDateTime(r.event_at)}</td>
                  <td style={{ fontSize: 12 }}>
                    <span className={r.event_type === "DESTRUCTION" ? "tag tag-danger" : "tag tag-warn"} style={{ fontSize: 11 }}>
                      {r.event_type === "DESTRUCTION" ? "DESTRUCTION" : "STATUS CHANGE"}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, fontWeight: 700 }}>{r.material_code}</td>
                  <td style={{ fontSize: 12 }}>{displayName}</td>
                  <td style={{ fontSize: 12, fontWeight: 700 }}>{r.lot_number}</td>
                  <td className="numeric" style={{ fontSize: 12 }}>
                    {qn === null ? "—" : qn} {r.uom_code || ""}
                  </td>
                  <td style={{ fontSize: 12 }}>{fromTo}</td>
                  <td style={{ fontSize: 12 }}>{r.reason || "—"}</td>
                  <td style={{ fontSize: 12 }}>{r.created_by || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="info-row" style={{ fontSize: 12, opacity: 0.85 }}>
        Notes:
        <ul style={{ margin: "6px 0 0 18px" }}>
          <li>Status-change entries reflect QUARANTINE ↔ AVAILABLE movements (including partial splits/merges).</li>
          <li>Destruction entries include <b>all</b> destruction consumptions (not only quarantined lots).</li>
        </ul>
      </div>
    </div>
  );
}
