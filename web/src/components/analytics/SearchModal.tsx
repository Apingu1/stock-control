import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api";

export type SearchType = "material_code" | "material_name" | "lot_number" | "product_code" | "batch_no";

export type SearchResult = {
  entity_type: "material" | "product" | "batch" | "lot";
  key: string;
  label: string;
  sublabel?: string;

  // ✅ only present for lot results (backend now returns these)
  material_code?: string;
  material_name?: string;
};

export const SearchModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onPick: (r: SearchResult) => void;
}> = ({ open, onClose, onPick }) => {
  const [searchType, setSearchType] = useState<SearchType>("product_code");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SearchResult[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const canSearch = useMemo(() => q.trim().length >= 1, [q]);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setRows([]);
    setQ("");
    // keep last searchType (intentional)
  }, [open]);

  async function runSearch() {
    if (!canSearch) return;
    setLoading(true);
    setErr(null);
    try {
      const url = `/analytics/search?search_type=${encodeURIComponent(searchType)}&q=${encodeURIComponent(q.trim())}&limit=25`;
      const res = await apiFetch(url);
      if (!res.ok) {
        setErr(`Search failed: HTTP ${res.status} — ${await res.text()}`);
        setRows([]);
        return;
      }
      setRows((await res.json()) as SearchResult[]);
    } catch (e: any) {
      setErr(String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function pick(r: SearchResult) {
    onPick(r);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal analytics-modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(980px, calc(100vw - 48px))",
          maxHeight: "min(720px, calc(100vh - 64px))",
        }}
      >
        <div className="modal-head">
          <div>
            <div className="card-title">Search / Explore</div>
            <div className="card-subtitle">Drill into Product → Batch → Material with reconcilable numbers.</div>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* ✅ controls fixed, aligned grid (fixes left skew) */}
        <div
          className="modal-controls"
          style={{
            padding: "14px 14px 10px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "260px 1fr",
              gap: 12,
              alignItems: "end",
            }}
          >
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>
                Search type
              </div>
              <select className="analytics-input" value={searchType} onChange={(e) => setSearchType(e.target.value as SearchType)}>
                <option value="product_code">Product code</option>
                <option value="batch_no">ES batch number</option>
                <option value="material_code">Material code</option>
                <option value="material_name">Material name</option>
                <option value="lot_number">Material lot number</option>
              </select>
            </div>

            <div>
              <div className="muted" style={{ marginBottom: 6 }}>
                Query
              </div>
              <input
                className="analytics-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
                placeholder="e.g. DULO2 / ES2643 / MAT001 / LOT123"
              />
            </div>
          </div>

          <div className="rowline" style={{ justifyContent: "space-between", marginTop: 12 }}>
            <div className="muted">
              {loading ? "Searching…" : rows.length ? `${rows.length} result(s)` : "Results"}
            </div>
            <button className="btn-primary" onClick={runSearch} disabled={!canSearch || loading}>
              🔎 Search
            </button>
          </div>

          {err ? (
            <div className="analytics-note" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
              {err}
            </div>
          ) : null}
        </div>

        {/* ✅ results scroll independently */}
        <div
          className="modal-body"
          style={{
            padding: 14,
            overflow: "auto",
            maxHeight: "calc(min(720px, (100vh - 64px)) - 170px)",
          }}
        >
          {rows.map((r, idx) => (
            <button
              key={`${r.entity_type}-${r.key}-${idx}`}
              className="search-result"
              onClick={() => pick(r)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.02)",
                marginBottom: 10,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <div className="mono" style={{ fontWeight: 700 }}>
                  {r.label}{" "}
                  <span className="chip" style={{ marginLeft: 10 }}>
                    {r.entity_type === "lot" ? "LOT" : r.entity_type.toUpperCase()}
                  </span>
                </div>
                {r.sublabel ? <div className="muted" style={{ marginTop: 4 }}>{r.sublabel}</div> : null}
              </div>
              <div className="muted">Open →</div>
            </button>
          ))}

          {rows.length === 0 && !loading ? (
            <div className="muted" style={{ padding: "18px 6px" }}>
              No results. Try a broader query.
            </div>
          ) : null}
        </div>

        <div className="modal-foot">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
