// web/src/components/audit/AuditTrailView.tsx
import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api";

type AuditEvent = {
  event_type: string;
  event_at: string; // ISO
  actor_username: string | null;
  actor_role?: string | null;
  target_type: string | null;
  target_ref: string | null;
  reason: string | null;
  before_json: any | null;
  after_json: any | null;
};

const toIsoDateInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatDateTime = (iso: string) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const safeJson = (obj: any) => {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
};

const AuditTrailView: React.FC = () => {
  // Filters
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toIsoDateInput(d);
  });
  const [dateTo, setDateTo] = useState<string>(() => toIsoDateInput(new Date()));
  const [eventType, setEventType] = useState<string>("");
  const [actor, setActor] = useState<string>("");
  const [q, setQ] = useState<string>("");

  // Paging
  const [limit, setLimit] = useState<number>(20);
  const [offset, setOffset] = useState<number>(0);

  // Data
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Row expansion
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);

  const hasMore = useMemo(() => events.length === limit, [events.length, limit]);

  const eventTypeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const e of events) s.add(e.event_type);
    return Array.from(s).sort();
  }, [events]);

  const buildUrl = () => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));

    // Backend filters (only include if present)
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (eventType) params.set("event_type", eventType);
    if (actor) params.set("actor_username", actor);
    if (q) params.set("q", q);

    return `/audit/events?${params.toString()}`;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(buildUrl());
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AuditEvent[];
      setEvents(data);
    } catch (e: any) {
      console.error(e);
      setEvents([]);
      setError(e?.message ?? "Failed to load audit events");
    } finally {
      setLoading(false);
    }
  };

  // Load when filters/paging changes
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, eventType, actor, q, limit, offset]);

  const resetPagingAndReload = () => {
    // offset change triggers useEffect -> load()
    setOffset(0);
  };

  const handleApply = (ev: React.FormEvent) => {
    ev.preventDefault();
    resetPagingAndReload();
  };

  const handleClear = () => {
    const d = new Date();
    const from = new Date();
    from.setDate(d.getDate() - 7);
    setDateFrom(toIsoDateInput(from));
    setDateTo(toIsoDateInput(d));
    setEventType("");
    setActor("");
    setQ("");
    setLimit(20);
    setOffset(0);
    setOpenRowKey(null);
  };

  // Small UI tidy: make fonts slightly smaller so rows fit better
  const compactFontSize = 13; // px
  const compactLineHeight = 1.25;

  return (
    <section
      className="card"
      style={{
        fontSize: compactFontSize,
        lineHeight: compactLineHeight,
      }}
    >
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="card-title">Audit Trail</div>
          <div className="card-subtitle">Append-only events (GMP)</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="pill-muted">{loading ? "Loading…" : `${events.length} events`}</span>
        </div>
      </div>

      {/* Filters (keep layout simple + consistent) */}
      <form onSubmit={handleApply} style={{ marginTop: 10 }}>
        <div className="filters" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          <div>
            <div className="label" style={{ fontSize: compactFontSize - 1 }}>
              Date from
            </div>
            <input
              className="input"
              style={{ fontSize: compactFontSize }}
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div>
            <div className="label" style={{ fontSize: compactFontSize - 1 }}>
              Date to
            </div>
            <input
              className="input"
              style={{ fontSize: compactFontSize }}
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <div>
            <div className="label" style={{ fontSize: compactFontSize - 1 }}>
              Event type
            </div>
            <input
              className="input"
              style={{ fontSize: compactFontSize }}
              list="audit-event-types"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="e.g. LOGIN_SUCCESS"
            />
            <datalist id="audit-event-types">
              {eventTypeOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div>
            <div className="label" style={{ fontSize: compactFontSize - 1 }}>
              Actor
            </div>
            <input
              className="input"
              style={{ fontSize: compactFontSize }}
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="e.g. admin"
            />
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <div className="label" style={{ fontSize: compactFontSize - 1 }}>
              Search
            </div>
            <input
              className="input"
              style={{ fontSize: compactFontSize }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="target_ref or reason"
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ fontSize: compactFontSize }}>
              Apply
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={handleClear}
              disabled={loading}
              style={{ fontSize: compactFontSize }}
            >
              Clear
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="label" style={{ margin: 0, fontSize: compactFontSize - 1 }}>
              Page size
            </span>
            <select
              className="input"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setOffset(0);
              }}
              style={{ width: 110, fontSize: compactFontSize }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </form>

      {error && (
        <div className="alert alert-error" style={{ marginTop: 12, fontSize: compactFontSize }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table className="table" style={{ fontSize: compactFontSize }}>
          <thead>
            <tr>
              <th style={{ width: 190 }}>Date/Time</th>
              <th style={{ width: 180 }}>Event Type</th>
              <th style={{ width: 140 }}>Actor</th>
              <th>Target</th>
              <th>Reason</th>
              <th style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {!loading && events.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ padding: "10px 12px" }}>
                  No audit events found for the selected filters.
                </td>
              </tr>
            )}

            {events.map((e, idx) => {
              const key = `${e.event_at}-${e.event_type}-${e.actor_username ?? "na"}-${idx}`;
              const isOpen = openRowKey === key;

              const hasDetails = !!e.before_json || !!e.after_json;

              return (
                <React.Fragment key={key}>
                  <tr style={{ verticalAlign: "top" }}>
                    <td style={{ padding: "10px 12px" }}>{formatDateTime(e.event_at)}</td>

                    <td style={{ padding: "10px 12px" }}>
                      <span className="pill" style={{ fontSize: compactFontSize - 1, padding: "3px 8px" }}>
                        {e.event_type}
                      </span>
                    </td>

                    <td style={{ padding: "10px 12px" }}>{e.actor_username ?? "—"}</td>

                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: compactFontSize }}>
                          <strong>{e.target_type ?? "—"}</strong>
                        </span>
                        <span
                          className="muted"
                          style={{
                            fontSize: compactFontSize - 1,
                            wordBreak: "break-word",
                            whiteSpace: "normal",
                          }}
                        >
                          {e.target_ref ?? "—"}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: "10px 12px", wordBreak: "break-word" }}>{e.reason ?? "—"}</td>

                    <td style={{ textAlign: "right", padding: "10px 12px" }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setOpenRowKey(isOpen ? null : key)}
                        disabled={!hasDetails}
                        title={!hasDetails ? "No before/after snapshot for this event" : ""}
                        style={{ fontSize: compactFontSize }}
                      >
                        {isOpen ? "Hide" : "Details"}
                      </button>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr>
                      <td colSpan={6} style={{ padding: "0 12px 12px 12px" }}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 12,
                            padding: 12,
                            background: "rgba(255,255,255,0.02)",
                            borderRadius: 12,
                          }}
                        >
                          <div>
                            <div className="label" style={{ fontSize: compactFontSize - 1 }}>
                              Before
                            </div>
                            <pre className="codeblock" style={{ maxHeight: 360, overflow: "auto", fontSize: 12 }}>
                              {safeJson(e.before_json)}
                            </pre>
                          </div>

                          <div>
                            <div className="label" style={{ fontSize: compactFontSize - 1 }}>
                              After
                            </div>
                            <pre className="codeblock" style={{ maxHeight: 360, overflow: "auto", fontSize: 12 }}>
                              {safeJson(e.after_json)}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => setOffset(Math.max(0, offset - limit))}
          disabled={loading || offset === 0}
          style={{ fontSize: compactFontSize }}
        >
          ← Previous
        </button>

        <div className="muted" style={{ alignSelf: "center", fontSize: compactFontSize - 1 }}>
          Offset {offset}
        </div>

        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => setOffset(offset + limit)}
          disabled={loading || !hasMore}
          title={!hasMore ? "No more results" : ""}
          style={{ fontSize: compactFontSize }}
        >
          Next →
        </button>
      </div>
    </section>
  );
};

export default AuditTrailView;
