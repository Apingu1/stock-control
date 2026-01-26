import React, { useEffect, useState } from "react";
import { apiFetch } from "../../utils/api";

export type SearchResult = {
  entity_type: "material" | "lot" | "product" | "batch";
  key: string;
  label: string;
  sublabel?: string | null;
};

const Chip: React.FC<{ children: React.ReactNode; variant?: "blue" | "purple" | "green" | "muted" }> = ({
  children,
  variant = "muted",
}) => {
  const cls =
    variant === "blue"
      ? "analytics-chip analytics-chip-blue"
      : variant === "purple"
      ? "analytics-chip analytics-chip-purple"
      : variant === "green"
      ? "analytics-chip analytics-chip-green"
      : "analytics-chip";
  return <span className={cls}>{children}</span>;
};

export const SearchModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onPick: (r: SearchResult) => void;
}> = ({ open, onClose, onPick }) => {
  const [searchType, setSearchType] = useState<
    "material_code" | "material_name" | "lot_number" | "product_code" | "batch_no"
  >("material_code");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);

  async function run() {
    const qq = q.trim();
    if (!qq) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(
        `/analytics/search?search_type=${encodeURIComponent(searchType)}&q=${encodeURIComponent(qq)}&limit=15`
      );
      if (res.status === 403) {
        setResults([]);
        return;
      }
      const data = (await res.json()) as SearchResult[];
      setResults(data || []);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => run(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, searchType, open]);

  if (!open) return null;

  return (
    <div className="analytics-overlay" onClick={onClose}>
      <div className="analytics-modal card analytics-modal-v2" onClick={(e) => e.stopPropagation()}>
        <div className="analytics-modal-head">
          <div>
            <div className="card-title">Search / Explore</div>
            <div className="card-subtitle">Drill into Product → Batch → Material with reconcilable numbers.</div>
          </div>
          <button className="btn-secondary" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="analytics-modal-body-v2">
          <div className="analytics-modal-controls">
            <div>
              <label className="analytics-label">Search type</label>
              <select className="analytics-input" value={searchType} onChange={(e) => setSearchType(e.target.value as any)}>
                <option value="material_code">By Material Code</option>
                <option value="material_name">By Material Name</option>
                <option value="lot_number">By Lot Number</option>
                <option value="product_code">By Product Code (e.g. DULO2)</option>
                <option value="batch_no">By ES Batch Number</option>
              </select>
            </div>

            <div>
              <label className="analytics-label">Query</label>
              <input
                className="analytics-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. SORB-001 / Sorbitol / LOT-24-1187 / DULO2 / ES000287"
                autoFocus
              />
            </div>
          </div>

          <div className="analytics-results-head">
            <div className="rowline">
              <Chip variant="purple">Results</Chip>
              <span className="muted">Click to open analytics</span>
            </div>
            <span className="mono">{busy ? "Searching…" : `${results.length} result(s)`}</span>
          </div>

          <div className="analytics-results-list analytics-results-list-v2">
            {results.map((r) => (
              <button
                key={`${r.entity_type}:${r.key}`}
                className="analytics-result-item"
                onClick={() => {
                  onPick(r);
                  onClose();
                }}
              >
                <div className="analytics-result-left">
                  <div className="analytics-result-title">
                    <span className="mono">{r.label}</span>{" "}
                    <Chip variant={r.entity_type === "product" ? "blue" : r.entity_type === "batch" ? "purple" : "green"}>
                      {r.entity_type.toUpperCase()}
                    </Chip>
                  </div>
                  <div className="analytics-result-sub">{r.sublabel || ""}</div>
                </div>
                <div className="analytics-result-right">Open →</div>
              </button>
            ))}
            {results.length === 0 && !busy ? <div className="analytics-empty">No results</div> : null}
          </div>
        </div>

        <div className="analytics-modal-foot">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" onClick={() => run()} disabled={busy}>
            🔎 Search
          </button>
        </div>
      </div>
    </div>
  );
};
