import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api";
import { formatDate } from "../../utils/format";

type ExpiryThresholdRow = {
  id: number;
  category_code: string;
  type_code: string;
  threshold_days: number;
  is_active: boolean;
  updated_at: string;
  updated_by?: string | null;
};

export default function AdminSettingsView() {
  const [rows, setRows] = useState<ExpiryThresholdRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.category_code !== b.category_code) return a.category_code.localeCompare(b.category_code);
      return a.type_code.localeCompare(b.type_code);
    });
  }, [rows]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/admin/expiry-thresholds");
      const data = (await res.json()) as ExpiryThresholdRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveRow(
    id: number,
    patch: Partial<Pick<ExpiryThresholdRow, "threshold_days" | "is_active">>
  ) {
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
      setError(e?.message || "Failed to save");
    } finally {
      setSaving((p) => ({ ...p, [id]: false }));
    }
  }

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Settings</div>
            <div className="card-subtitle">
              Admin-configurable system settings. (low expiry auto-quarantine thresholds)
            </div>
          </div>

          <div className="card-actions card-actions-wrap">
            <button onClick={load} disabled={loading} className="btn" type="button">
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {error && <div className="error-row">{error}</div>}
        {loading && <div className="info-row">Loading settings…</div>}

        {!loading && !error && (
          <>
            <div className="info-row" style={{ fontSize: 12, opacity: 0.85 }}>
              Note: These thresholds control when the system auto-quarantines <b>AVAILABLE</b> lots due to low expiry.
            </div>

            <div className="table-wrapper" style={{ maxHeight: 520, overflowY: "auto" }}>
              <table className="table">
                <thead
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#050816",
                  }}
                >
                  <tr>
                    <th style={{ width: 220 }}>Category</th>
                    <th style={{ width: 220 }}>Type</th>
                    <th className="numeric" style={{ width: 160 }}>
                      Threshold (days)
                    </th>
                    <th style={{ width: 120 }}>Active</th>
                    <th style={{ width: 140 }}>Updated</th>
                    <th style={{ width: 160 }}>Updated By</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={7} className="empty-row">
                        No threshold rows found.
                      </td>
                    </tr>
                  )}

                  {sorted.map((r) => {
                    const isSaving = !!saving[r.id];

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
                            disabled={isSaving}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.id === r.id
                                    ? { ...x, threshold_days: Number.isFinite(next) ? next : 0 }
                                    : x
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
                              disabled={isSaving}
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
                            }}
                            disabled={isSaving}
                            onClick={() =>
                              saveRow(r.id, { threshold_days: r.threshold_days, is_active: r.is_active })
                            }
                            title="Save changes"
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
          </>
        )}
      </section>
    </section>
  );
}
