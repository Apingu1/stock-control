import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api";

type MaintenanceState = {
  enabled: boolean;
  reason: string;
  set_by: string;
  set_at_utc: string;
};

type DbSystemInfo = {
  app: { version: string; timezone: string };
  database: {
    host: string;
    port: string;
    name: string;
    user: string;
    postgres_version: string;
    size_bytes: number | null;
  };
  backups: {
    backup_dir_container: string;
    backup_dir_label: string;
  };
  maintenance: MaintenanceState;
  security: { requested_by: string; requested_at_utc: string };
};

type BackupManifest = {
  filename?: string;
  created_at_utc?: string;
  created_by?: string;
  result?: string;
  size_bytes?: number;
  completed_at_utc?: string;
  error?: string;
  db?: { name?: string };
};

type BackupItem = {
  filename: string;
  size_bytes: number;
  modified_at_utc: string;
  manifest?: BackupManifest | null;
};

type BackupsList = {
  backup_dir_container?: string;
  backup_dir_label?: string;
  count: number;
  items: BackupItem[];
  requested_by: string;
  requested_at_utc: string;
};

type DatasetsResponse = {
  active_db: string;
  datasets: string[];
  pattern: string;
  requested_by: string;
  requested_at_utc: string;
};

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const dp = i === 0 ? 0 : i === 1 ? 0 : 1;
  return `${v.toFixed(dp)} ${units[i]}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function mono(s: string) {
  return <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{s}</span>;
}

async function downloadAsFile(res: Response, filename: string) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const Card = ({ title, subtitle, right, children }: any) => (
  <section
    className="card"
    style={{
      marginTop: 16,
      border: "1px solid rgba(255,255,255,0.08)",
      background:
        "radial-gradient(900px 460px at 0% 0%, rgba(59,130,246,0.12), transparent 60%), rgba(15, 23, 42, 0.55)",
      boxShadow: "0 20px 60px rgba(0,0,0,0.30)",
    }}
  >
    <div className="card-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
      <div>
        <div className="card-title">{title}</div>
        {subtitle ? (
          <div className="card-subtitle" style={{ opacity: 0.9 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {right ? <div style={{ display: "flex", gap: 10, alignItems: "center" }}>{right}</div> : null}
    </div>
    {children}
  </section>
);

function looksLikeRestoreActuallySucceeded(errMsg: string): boolean {
  // The user-reported case:
  // pg_restore: ERROR: unrecognized configuration parameter "transaction_timeout"
  // Command was: SET transaction_timeout = 0;
  // pg_restore: warning: errors ignored on restore: 1
  const s = (errMsg || "").toLowerCase();
  return (
    s.includes("pg_restore") &&
    s.includes("transaction_timeout") &&
    (s.includes("unrecognized configuration parameter") || s.includes("command was: set transaction_timeout")) &&
    (s.includes("errors ignored on restore") || s.includes("warning"))
  );
}

export default function DbToolsPanel() {
  const [info, setInfo] = useState<DbSystemInfo | null>(null);
  const [backups, setBackups] = useState<BackupsList | null>(null);
  const [datasets, setDatasets] = useState<DatasetsResponse | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null);

  const [loading, setLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [err, setErr] = useState<string>("");
  const [warn, setWarn] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  // Manifest modal
  const [manifestOpen, setManifestOpen] = useState(false);
  const [manifestJson, setManifestJson] = useState<any>(null);
  const [manifestTitle, setManifestTitle] = useState<string>("");

  // Restore form
  const [restoreBackup, setRestoreBackup] = useState<string>("");
  const [restoreDbName, setRestoreDbName] = useState<string>("");
  const [restoreNote, setRestoreNote] = useState<string>("");
  const [restoreConfirm, setRestoreConfirm] = useState<string>("");
  const [restoring, setRestoring] = useState(false);

  // Switch form
  const [switchNote, setSwitchNote] = useState<string>("");
  const [switchConfirm, setSwitchConfirm] = useState<string>("");
  const [switchingTo, setSwitchingTo] = useState<string>("");

  // Maintenance form
  const [maintReason, setMaintReason] = useState<string>("");
  const [togglingMaint, setTogglingMaint] = useState(false);

  const refreshAll = async () => {
    setLoading(true);
    setErr("");
    setStatus("");
    // NOTE: do not clear warn here — warnings should persist until user action or next success
    try {
      const [a, b, c, d] = await Promise.all([
        apiFetch("/admin/db-tools/system-info").then((r) => r.json()),
        apiFetch("/admin/db-tools/backups").then((r) => r.json()),
        apiFetch("/admin/db-tools/datasets").then((r) => r.json()),
        apiFetch("/admin/db-tools/maintenance").then((r) => r.json()),
      ]);
      setInfo(a as DbSystemInfo);
      setBackups(b as BackupsList);
      setDatasets(c as DatasetsResponse);
      setMaintenance(d as MaintenanceState);

      // Default restore selection to latest backup
      const first = (b as BackupsList)?.items?.[0]?.filename;
      if (first && !restoreBackup) setRestoreBackup(first);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backupRows = useMemo(() => {
    const items = backups?.items ?? [];
    return [...items].sort((a, b) => (a.modified_at_utc < b.modified_at_utc ? 1 : -1));
  }, [backups]);

  const hostLabel = info?.backups?.backup_dir_label || backups?.backup_dir_label || "./backups (host bind mount)";
  const containerPath = info?.backups?.backup_dir_container || backups?.backup_dir_container || "/backups";

  const createBackupNow = async () => {
    const ok = confirm(
      "Create a database backup now?\n\nThis generates a pg_dump file and a JSON manifest for GMP inspection evidence."
    );
    if (!ok) return;

    setCreatingBackup(true);
    setErr("");
    setWarn("");
    setStatus("");
    try {
      const res = await apiFetch("/admin/db-tools/backup", { method: "POST" });
      const data = await res.json();
      await refreshAll();
      setStatus(`Backup created: ${data?.backup?.filename || "OK"}`);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setCreatingBackup(false);
    }
  };

  const doDownloadDump = async (filename: string) => {
    setErr("");
    try {
      const res = await apiFetch(`/admin/db-tools/backup/${encodeURIComponent(filename)}/download`);
      await downloadAsFile(res, filename);
      setStatus(`Downloaded: ${filename}`);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  };

  const doDownloadManifest = async (filename: string) => {
    setErr("");
    try {
      const res = await apiFetch(`/admin/db-tools/backup/${encodeURIComponent(filename)}/manifest`);
      const data = await res.json();
      // Also allow saving as file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus(`Downloaded manifest: ${filename}.json`);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  };

  const openManifestModal = async (filename: string) => {
    setErr("");
    try {
      const res = await apiFetch(`/admin/db-tools/backup/${encodeURIComponent(filename)}/manifest`);
      const data = await res.json();
      setManifestTitle(filename);
      setManifestJson(data);
      setManifestOpen(true);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  };

  const runRestore = async () => {
    if (!restoreBackup) {
      setErr("Select a backup first.");
      return;
    }
    if (restoreConfirm.trim() !== "RESTORE") {
      setErr('Confirm phrase must be exactly "RESTORE".');
      return;
    }
    const ok = confirm(
      "Restore this backup into a NEW dataset database?\n\nThe system will automatically enter maintenance mode during the restore."
    );
    if (!ok) return;

    setRestoring(true);
    setErr("");
    setWarn("");
    setStatus("");
    try {
      const res = await apiFetch("/admin/db-tools/restore", {
        method: "POST",
        body: JSON.stringify({
          backup_filename: restoreBackup,
          new_db_name: restoreDbName || undefined,
          audit_note: restoreNote || undefined,
          confirm_phrase: restoreConfirm,
        }),
      });
      const data = await res.json();
      await refreshAll();
      setStatus(`Restore complete: ${data?.new_db || "OK"}`);
      setRestoreConfirm("");

      // Suggest switching confirmation to the new DB name
      if (data?.new_db) setSwitchConfirm(data.new_db);
    } catch (e: any) {
      const msg = e?.message || String(e);

      // Special case: pg_restore returned non-zero because it tried to SET transaction_timeout,
      // but the restore still largely completed and the DB exists (user observed it).
      if (looksLikeRestoreActuallySucceeded(msg)) {
        setErr("");
        setWarn(
          "Restore completed with warnings.\n\nThis environment rejected a pg_restore setting (transaction_timeout), but the dataset is often still created successfully.\n\nNext: (1) Refresh (already done), (2) check the new dataset is listed below, and (3) disable Maintenance Mode if it is still ON."
        );
        try {
          await refreshAll();
          setStatus("Restore likely succeeded (with warnings). Please confirm dataset appears below.");
        } catch {
          // ignore secondary refresh failures
        }
        // keep confirm phrase blank after attempt
        setRestoreConfirm("");
      } else {
        setErr(msg);
      }

      // Refresh maintenance state (restore may leave maintenance ON if failure/warnings)
      try {
        const m = await apiFetch("/admin/db-tools/maintenance").then((r) => r.json());
        setMaintenance(m as MaintenanceState);
      } catch {
        // ignore
      }
    } finally {
      setRestoring(false);
    }
  };

  const runSwitch = async (target: string) => {
    if (!target) return;
    if (switchConfirm.trim() !== target) {
      setErr("Confirm phrase must exactly match the target dataset name.");
      return;
    }
    const ok = confirm(
      `Switch ACTIVE dataset globally to: ${target}?\n\nThis affects ALL users immediately (new requests use the new dataset).`
    );
    if (!ok) return;

    setSwitchingTo(target);
    setErr("");
    setWarn("");
    setStatus("");
    try {
      const res = await apiFetch("/admin/db-tools/datasets/switch", {
        method: "POST",
        body: JSON.stringify({
          db_name: target,
          audit_note: switchNote || undefined,
          confirm_phrase: switchConfirm,
        }),
      });
      await res.json();
      await refreshAll();
      setStatus(`Active dataset switched to: ${target}`);
      setSwitchConfirm("");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSwitchingTo("");
    }
  };

  const setMaintenanceMode = async (enabled: boolean) => {
    setTogglingMaint(true);
    setErr("");
    setWarn("");
    setStatus("");
    try {
      const res = await apiFetch("/admin/db-tools/maintenance", {
        method: "POST",
        body: JSON.stringify({ enabled, reason: maintReason }),
      });
      const data = (await res.json()) as MaintenanceState;
      setMaintenance(data);
      setInfo((prev) => (prev ? { ...prev, maintenance: data } : prev));
      setStatus(enabled ? "Maintenance enabled." : "Maintenance disabled.");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setTogglingMaint(false);
    }
  };

  const activeDb = datasets?.active_db || info?.database?.name || "—";
  const allowlistPattern = datasets?.pattern || "^stock…$";

  return (
    <Card
      title="Database & Backups"
      subtitle="GMP-critical dataset controls. Admin-only, confirmed, and audit-logged."
      right={
        <>
          <button type="button" className="btn" onClick={() => void refreshAll()} disabled={loading || creatingBackup}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" className="btn primary" onClick={() => void createBackupNow()} disabled={creatingBackup}>
            {creatingBackup ? "Creating backup…" : "Create Backup"}
          </button>
        </>
      }
    >
      {err && (
        <div
          className="info-row"
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.08)",
            color: "#fecaca",
            whiteSpace: "pre-wrap",
          }}
        >
          <b>Error:</b> {err}
        </div>
      )}

      {warn && (
        <div
          className="info-row"
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(234,179,8,0.35)",
            background: "rgba(234,179,8,0.10)",
            color: "rgba(255,255,255,0.92)",
            whiteSpace: "pre-wrap",
          }}
        >
          <b>Warning:</b> {warn}
        </div>
      )}

      {status && (
        <div
          className="info-row"
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(16,185,129,0.28)",
            background: "rgba(16,185,129,0.10)",
            color: "rgba(255,255,255,0.92)",
            whiteSpace: "pre-wrap",
          }}
        >
          {status}
        </div>
      )}

      {/* GMP disclaimer */}
      <div
        className="info-row"
        style={{
          marginTop: 10,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(2, 6, 23, 0.30)",
          padding: 14,
          fontSize: 13,
          opacity: 0.92,
          lineHeight: 1.5,
        }}
      >
        <b>GMP note:</b> These controls are <b>global</b> (affect all users). High-impact actions require confirmations and
        are recorded to an append-only audit log in {mono("/backups")}.
      </div>

      {/* Location banner */}
      <div
        className="info-row"
        style={{
          marginTop: 10,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(2, 6, 23, 0.32)",
          padding: 14,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Backup location (host/server)</div>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.2 }}>{mono(hostLabel)}</div>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
          Container path: {mono(containerPath)} (bind-mounted to the host location above)
        </div>
      </div>

      {/* Top stats */}
      <div className="info-row" style={{ marginTop: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(2, 6, 23, 0.38)",
              padding: 12,
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Active dataset</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{mono(activeDb)}</div>
          </div>
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(2, 6, 23, 0.38)",
              padding: 12,
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>DB size</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{formatBytes(info?.database?.size_bytes)}</div>
          </div>
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(2, 6, 23, 0.38)",
              padding: 12,
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Backups</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{String(backups?.count ?? backupRows.length)}</div>
          </div>
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(2, 6, 23, 0.38)",
              padding: 12,
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Maintenance</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>
              {maintenance?.enabled ? (
                <span style={{ color: "#fecaca" }}>ON</span>
              ) : (
                <span style={{ color: "rgba(255,255,255,0.90)" }}>OFF</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Maintenance controls */}
      <div className="info-row" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Maintenance Mode</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            When ON, mutating endpoints return 503 (read-only remains available).
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(2, 6, 23, 0.26)",
            padding: 14,
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.92, lineHeight: 1.5 }}>
            <div>
              <b>Status:</b> {maintenance?.enabled ? "ON" : "OFF"}
              {maintenance?.set_at_utc ? ` • ${formatDateTime(maintenance.set_at_utc)}` : ""}
              {maintenance?.set_by ? ` • by ${maintenance.set_by}` : ""}
            </div>
            {maintenance?.reason ? <div style={{ opacity: 0.9 }}>{maintenance.reason}</div> : null}
          </div>

          <input
            className="input"
            style={{ minWidth: 360 }}
            placeholder="Reason / note (audit log)"
            value={maintReason}
            onChange={(e) => setMaintReason(e.target.value)}
          />

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="btn"
              disabled={togglingMaint || maintenance?.enabled}
              onClick={() => void setMaintenanceMode(true)}
            >
              Enable
            </button>
            <button
              type="button"
              className="btn"
              disabled={togglingMaint || !maintenance?.enabled}
              onClick={() => void setMaintenanceMode(false)}
            >
              Disable
            </button>
          </div>
        </div>
      </div>

      {/* Backups */}
      <div className="info-row" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Backups</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Each backup produces a <b>.dump</b> and a <b>.dump.json</b> manifest.
          </div>
        </div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table
            className="table"
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              borderRadius: 14,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(2, 6, 23, 0.22)",
            }}
          >
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", minWidth: 320 }}>Filename</th>
                <th style={{ padding: "10px 12px", textAlign: "left", minWidth: 90 }}>Size</th>
                <th style={{ padding: "10px 12px", textAlign: "left", minWidth: 190 }}>Created (UTC)</th>
                <th style={{ padding: "10px 12px", textAlign: "left", minWidth: 120 }}>Created by</th>
                <th style={{ padding: "10px 12px", textAlign: "left", minWidth: 110 }}>Result</th>
                <th style={{ padding: "10px 12px", textAlign: "left", minWidth: 190 }}>Modified (UTC)</th>
                <th style={{ padding: "10px 12px", textAlign: "left", minWidth: 260 }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {backupRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 14, opacity: 0.75 }}>
                    {loading ? "Loading backups…" : "No backups found."}
                  </td>
                </tr>
              ) : (
                backupRows.map((b, idx) => {
                  const m = b.manifest || {};
                  const createdAt = m.completed_at_utc || m.created_at_utc || "";
                  const createdBy = m.created_by || "—";
                  const result = m.result || "—";
                  const rowBg = idx % 2 === 0 ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.00)";

                  const pillStyle =
                    result === "SUCCESS"
                      ? { background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.35)" }
                      : result === "FAILED"
                      ? { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)" }
                      : { background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.35)" };

                  return (
                    <tr key={b.filename} style={{ background: rowBg }}>
                      <td style={{ padding: "10px 12px" }}>{mono(b.filename)}</td>
                      <td style={{ padding: "10px 12px" }}>{formatBytes(b.size_bytes)}</td>
                      <td style={{ padding: "10px 12px" }}>{formatDateTime(createdAt)}</td>
                      <td style={{ padding: "10px 12px" }}>{createdBy}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 800,
                            letterSpacing: 0.3,
                            ...pillStyle,
                          }}
                        >
                          {result}
                        </span>
                        {m.error ? (
                          <div style={{ marginTop: 8, fontSize: 12, color: "#fecaca", opacity: 0.95, maxWidth: 560 }}>
                            {m.error}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ padding: "10px 12px" }}>{formatDateTime(b.modified_at_utc)}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" className="btn" onClick={() => void doDownloadDump(b.filename)}>
                            Download .dump
                          </button>
                          <button type="button" className="btn" onClick={() => void doDownloadManifest(b.filename)}>
                            Download .json
                          </button>
                          <button type="button" className="btn" onClick={() => void openManifestModal(b.filename)}>
                            View manifest
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setRestoreBackup(b.filename);
                              setStatus(`Selected for restore: ${b.filename}`);
                            }}
                          >
                            Use for restore
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restore */}
      <div className="info-row" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Restore into a NEW dataset</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Auto-enables maintenance mode during restore.</div>
        </div>

        <div
          style={{
            marginTop: 10,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(2, 6, 23, 0.26)",
            padding: 14,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Selected backup</div>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>{restoreBackup ? mono(restoreBackup) : "—"}</div>

            <div style={{ display: "grid", gap: 10 }}>
              <input
                className="input"
                placeholder="New dataset DB name (optional — auto generated if blank)"
                value={restoreDbName}
                onChange={(e) => setRestoreDbName(e.target.value)}
              />
              <input
                className="input"
                placeholder="Audit note / reason (recommended)"
                value={restoreNote}
                onChange={(e) => setRestoreNote(e.target.value)}
              />
              <input
                className="input"
                placeholder='Confirm phrase: type RESTORE'
                value={restoreConfirm}
                onChange={(e) => setRestoreConfirm(e.target.value)}
              />
              <button type="button" className="btn primary" disabled={restoring} onClick={() => void runRestore()}>
                {restoring ? "Restoring…" : "Restore backup into new dataset"}
              </button>

              <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.45 }}>
                Restore is non-destructive to the current dataset (it creates a <b>new</b> DB). If the restore fails or
                completes with warnings, the system may remain in maintenance mode until you disable it.
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Dataset name rules (allowlist)</div>

            {/* This is the user-requested wording: */}
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(2, 6, 23, 0.30)",
                padding: 12,
                fontSize: 13,
                opacity: 0.95,
                lineHeight: 1.55,
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <b>Why this exists:</b> it’s a safety guard so dataset tools only ever touch databases intended for this
                app (prevents accidental switching/restoring into system DBs like <b>postgres</b> / templates).
              </div>

              <div style={{ marginBottom: 6 }}>
                <b>Pattern enforced by backend:</b> {mono(allowlistPattern)}
              </div>

              <div style={{ marginTop: 10, fontSize: 13 }}>
                <b>Friendly rule:</b> Database names must start with <b>stock</b> and contain only letters, numbers, or
                underscore (_). Example: {mono("stock_training_202602")}. Hyphens (-) and spaces are not allowed.
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Suggested workflow</div>
            <div style={{ fontSize: 13, opacity: 0.92, lineHeight: 1.55 }}>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li>Create or select a backup</li>
                <li>
                  Restore into a new dataset (e.g. {mono("stock_training_202602")} or {mono("stock_restore_YYYYMMDD_HHMM")})
                </li>
                <li>Check the new dataset appears in the Datasets list below</li>
                <li>Disable Maintenance Mode (if still ON)</li>
                <li>Switch the active dataset globally (affects all users)</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Datasets */}
      <div className="info-row" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Datasets (global)</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Switching affects ALL users (new requests).</div>
        </div>

        <div
          style={{
            marginTop: 10,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(2, 6, 23, 0.26)",
            padding: 14,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input
              className="input"
              placeholder="Audit note / reason (recommended)"
              value={switchNote}
              onChange={(e) => setSwitchNote(e.target.value)}
            />
            <input
              className="input"
              placeholder="Confirm phrase (must match target dataset name)"
              value={switchConfirm}
              onChange={(e) => setSwitchConfirm(e.target.value)}
            />
          </div>

          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table
              className="table"
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                borderRadius: 14,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(2, 6, 23, 0.22)",
              }}
            >
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", minWidth: 320 }}>DB name</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", minWidth: 160 }}>Status</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", minWidth: 220 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(datasets?.datasets || []).length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: 14, opacity: 0.75 }}>
                      No dataset DBs found matching allowlist.
                    </td>
                  </tr>
                ) : (
                  (datasets?.datasets || []).map((db) => {
                    const isActive = db === activeDb;
                    return (
                      <tr key={db} style={{ background: "rgba(255,255,255,0.01)" }}>
                        <td style={{ padding: "10px 12px" }}>{mono(db)}</td>
                        <td style={{ padding: "10px 12px" }}>
                          {isActive ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "4px 10px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 900,
                                letterSpacing: 0.3,
                                background: "rgba(16,185,129,0.14)",
                                border: "1px solid rgba(16,185,129,0.35)",
                              }}
                            >
                              ACTIVE
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, opacity: 0.75 }}>Available</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {isActive ? null : (
                            <button
                              type="button"
                              className="btn"
                              disabled={!!switchingTo || maintenance?.enabled}
                              onClick={() => void runSwitch(db)}
                            >
                              {switchingTo === db ? "Switching…" : maintenance?.enabled ? "Maintenance ON" : "Set active"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {maintenance?.enabled ? (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85, color: "#fecaca" }}>
              Dataset switching is disabled while maintenance mode is ON.
            </div>
          ) : null}
        </div>
      </div>

      {/* Manifest modal */}
      {manifestOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
          onClick={() => setManifestOpen(false)}
        >
          <div
            className="card"
            style={{
              width: "min(980px, 100%)",
              maxHeight: "85vh",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(2, 6, 23, 0.86)",
              boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div className="card-title">Backup manifest</div>
                <div className="card-subtitle" style={{ opacity: 0.9 }}>
                  {mono(manifestTitle)}
                </div>
              </div>
              <button type="button" className="btn" onClick={() => setManifestOpen(false)}>
                Close
              </button>
            </div>
            <div style={{ padding: 14, overflow: "auto", maxHeight: "calc(85vh - 80px)" }}>
              <pre
                style={{
                  margin: 0,
                  fontSize: 12,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  color: "rgba(255,255,255,0.92)",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                {JSON.stringify(manifestJson, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}