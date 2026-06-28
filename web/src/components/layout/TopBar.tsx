import React, { useEffect, useState } from "react";
import { formatNowChip } from "../../utils/format";
import { apiFetch } from "../../utils/api";

type Header = {
  tag: string;
  title: string;
  subtitle: string;
};

type Props = {
  header: Header;
  isSignedIn: boolean;
  onNewMaterial: () => void;
  onNewReceipt: () => void;
  onNewIssue: () => void;
};

const TopBar: React.FC<Props> = ({
  header,
  isSignedIn,
  onNewMaterial,
  onNewReceipt,
  onNewIssue,
}) => {
  const [now, setNow] = useState(() => formatNowChip());
  const [maintenance, setMaintenance] = useState<{
    enabled: boolean;
    reason?: string;
    set_by?: string;
    set_at_utc?: string;
  } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(formatNowChip()), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        // Public endpoint (no auth required) — apiFetch is fine.
        const res = await apiFetch("/admin/db-tools/maintenance");
        const data = (await res.json()) as any;
        if (!cancelled) setMaintenance(data);
      } catch {
        // If API not reachable, ignore.
        if (!cancelled) setMaintenance(null);
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <>
      {maintenance?.enabled ? (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            padding: "10px 14px",
            borderBottom: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.10)",
            color: "rgba(255,255,255,0.94)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontWeight: 900 }}>
              🛠️ Maintenance Mode ON
              <span style={{ fontWeight: 600, opacity: 0.9 }}> — writes are temporarily disabled</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.9, textAlign: "right" }}>
              {maintenance?.reason ? <div>{maintenance.reason}</div> : null}
              {(maintenance?.set_by || maintenance?.set_at_utc) && (
                <div style={{ opacity: 0.8 }}>
                  {maintenance?.set_by ? `by ${maintenance.set_by}` : ""}
                  {maintenance?.set_at_utc ? ` • ${new Date(maintenance.set_at_utc).toLocaleString("en-GB")}` : ""}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <header className="top-bar">
        <div className="top-bar-left">
          <div className="page-tag">{header.tag}</div>
          <div className="page-title">{header.title}</div>
          <div className="page-subtitle">{header.subtitle}</div>
        </div>

      {/* Centered status/time pill */}
      <div className="top-bar-center">
        <div className="chip chip-now" title="Live time (Europe/London)">
          <span className="chip-dot" />
          {now}
        </div>
      </div>

      {/* Primary actions */}
      <div className="top-bar-right">
        <button
          className="btn btn-accent-green"
          type="button"
          onClick={onNewMaterial}
          disabled={!isSignedIn}
          title={!isSignedIn ? "Please sign in" : ""}
        >
          🧪 New Material
        </button>

        <button
          className="btn btn-accent-amber"
          type="button"
          onClick={onNewReceipt}
          disabled={!isSignedIn}
          title={!isSignedIn ? "Please sign in" : ""}
        >
          📥 New Goods Receipt
        </button>

        <button
          className="btn btn-primary"
          type="button"
          onClick={onNewIssue}
          disabled={!isSignedIn}
          title={!isSignedIn ? "Please sign in" : ""}
        >
          🚚 New Consumption
        </button>
      </div>
      </header>
    </>
  );
};

export default TopBar;
