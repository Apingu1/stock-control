import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../utils/api";


type MaintenanceState = {
  enabled: boolean;
  reason?: string;
  set_by?: string;
  set_at_utc?: string;
};

type DbSystemInfo = {
  app: { version: string; timezone: string };
  database: {
    host: string;
    port: string;
    name: string;
    user: string;
    postgres_version: string;
    size_bytes?: number | null;
  };
  backups: { backup_dir_container: string; backup_dir_label: string };
  maintenance: MaintenanceState;
};

type BackupManifest = {
  filename?: string;
  backup_type?: string;
  reason?: string;
  created_at_utc?: string;
  created_at_local?: string;
  completed_at_utc?: string;
  created_by?: string;
  database?: string;
  db?: { name?: string };
  size_bytes?: number;
  sha256?: string;
  result?: string;
  error?: string;
  original_filename?: string;
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
};

type SchedulerStatus = {
  last_result?: string;
  last_success_at_utc?: string;
  last_filename?: string;
  last_error?: string | null;
  last_heartbeat_utc?: string;
};

type BackupSettings = {
  enabled: boolean;
  time_local: string;
  timezone: string;
  retention_days: number;
  updated_by?: string;
  updated_at_utc?: string;
  backup_dir_label: string;
  backup_dir_container: string;
  next_run_at_local?: string | null;
  scheduler?: SchedulerStatus;
};

type DatasetsResponse = {
  active_db: string;
  datasets: string[];
  pattern: string;
};


function formatBytes(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;
  return `${amount.toFixed(index < 2 ? 0 : 1)} ${units[index]}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

function mono(value: string) {
  return <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{value}</span>;
}

async function downloadResponse(response: Response, filename: string) {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const sectionStyle = {
  marginTop: 12,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(2, 6, 23, 0.30)",
  padding: 16,
} as const;

const fieldLabelStyle = {
  fontSize: 12,
  opacity: 0.72,
  marginBottom: 6,
  fontWeight: 700,
} as const;


export default function DbToolsPanel() {
  const [info, setInfo] = useState<DbSystemInfo | null>(null);
  const [backups, setBackups] = useState<BackupsList | null>(null);
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [datasets, setDatasets] = useState<DatasetsResponse | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null);

  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [scheduleTime, setScheduleTime] = useState("02:30");
  const [retentionDays, setRetentionDays] = useState("30");

  const [manualReason, setManualReason] = useState("");
  const [restoreBackup, setRestoreBackup] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const restoreInput = useRef<HTMLInputElement | null>(null);

  const [switchReason, setSwitchReason] = useState("");
  const [maintReason, setMaintReason] = useState("");
  const [manifestOpen, setManifestOpen] = useState(false);
  const [manifestTitle, setManifestTitle] = useState("");
  const [manifestJson, setManifestJson] = useState<unknown>(null);

  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [switchingTo, setSwitchingTo] = useState("");
  const [togglingMaintenance, setTogglingMaintenance] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [status, setStatus] = useState("");

  const refreshAll = async (keepMessage = false) => {
    setLoading(true);
    setError("");
    if (!keepMessage) setStatus("");
    try {
      const [systemResponse, backupsResponse, settingsResponse, datasetsResponse, maintenanceResponse] =
        await Promise.all([
          apiFetch("/admin/db-tools/system-info").then((response) => response.json()),
          apiFetch("/admin/db-tools/backups").then((response) => response.json()),
          apiFetch("/admin/db-tools/backup-settings").then((response) => response.json()),
          apiFetch("/admin/db-tools/datasets").then((response) => response.json()),
          apiFetch("/admin/db-tools/maintenance").then((response) => response.json()),
        ]);

      setInfo(systemResponse as DbSystemInfo);
      setBackups(backupsResponse as BackupsList);
      setSettings(settingsResponse as BackupSettings);
      setDatasets(datasetsResponse as DatasetsResponse);
      setMaintenance(maintenanceResponse as MaintenanceState);

      const schedule = settingsResponse as BackupSettings;
      setScheduleEnabled(schedule.enabled);
      setScheduleTime(schedule.time_local);
      setRetentionDays(String(schedule.retention_days));
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  const backupRows = useMemo(
    () => [...(backups?.items || [])].sort((a, b) => b.modified_at_utc.localeCompare(a.modified_at_utc)),
    [backups]
  );

  const activeDb = datasets?.active_db || info?.database?.name || "—";
  const hostLocation = settings?.backup_dir_label || backups?.backup_dir_label || "Configured server folder";

  const saveSchedule = async () => {
    const retention = Number(retentionDays);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleTime)) {
      setError("Choose a valid daily backup time.");
      return;
    }
    if (!Number.isInteger(retention) || retention < 1 || retention > 3650) {
      setError("Automatic retention must be between 1 and 3650 days.");
      return;
    }
    setSavingSettings(true);
    setError("");
    setWarning("");
    try {
      const response = await apiFetch("/admin/db-tools/backup-settings", {
        method: "POST",
        body: JSON.stringify({
          enabled: scheduleEnabled,
          time_local: scheduleTime,
          retention_days: retention,
        }),
      });
      const updated = (await response.json()) as BackupSettings;
      setSettings(updated);
      setStatus(
        updated.enabled
          ? `Automatic daily backup saved for ${updated.time_local} (${updated.timezone}).`
          : "Automatic daily backups are disabled. Manual backups remain available."
      );
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setSavingSettings(false);
    }
  };

  const createBackupNow = async () => {
    setCreatingBackup(true);
    setError("");
    setWarning("");
    setStatus("");
    try {
      const response = await apiFetch("/admin/db-tools/backup", {
        method: "POST",
        body: JSON.stringify({ reason: manualReason.trim() || "Manual administrator backup" }),
      });
      const data = await response.json();
      setManualReason("");
      await refreshAll(true);
      setStatus(`Manual backup created: ${data?.backup?.filename || "complete"}`);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setCreatingBackup(false);
    }
  };

  const downloadDump = async (filename: string) => {
    setError("");
    try {
      const response = await apiFetch(`/admin/db-tools/backup/${encodeURIComponent(filename)}/download`);
      await downloadResponse(response, filename);
      setStatus(`Downloaded: ${filename}`);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    }
  };

  const openManifest = async (filename: string) => {
    setError("");
    try {
      const response = await apiFetch(`/admin/db-tools/backup/${encodeURIComponent(filename)}/manifest`);
      setManifestJson(await response.json());
      setManifestTitle(filename);
      setManifestOpen(true);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    }
  };

  const verifyStoredBackup = async (filename: string) => {
    setError("");
    setWarning("");
    setStatus(`Verifying SHA-256 for ${filename}…`);
    try {
      const response = await apiFetch(`/admin/db-tools/backup/${encodeURIComponent(filename)}/verify`);
      const result = await response.json();
      setStatus(
        result.integrity === "VERIFIED"
          ? `Backup integrity verified: ${filename}`
          : `Custom-format backup is readable, but no SHA-256 manifest is available: ${filename}`
      );
    } catch (caught: unknown) {
      setStatus("");
      setError(errorMessage(caught));
    }
  };

  const runRestore = async () => {
    if (!restoreFile && !restoreBackup) {
      setError("Choose a backup file or select one from the stored backups table.");
      return;
    }
    if (!restoreReason.trim()) {
      setError("Enter the reason for the restore.");
      return;
    }
    const selectedName = restoreFile?.name || restoreBackup;
    const confirmed = window.confirm(
      `Restore and activate this backup?\n\n${selectedName}\n\nA pre-restore safety backup will be created automatically. The restored data will become active for all users after validation.`
    );
    if (!confirmed) return;

    setRestoring(true);
    setError("");
    setWarning("");
    setStatus(restoreFile ? "Uploading and validating backup…" : "Validating backup…");
    try {
      let storedFilename = restoreBackup;
      if (restoreFile) {
        const uploadResponse = await apiFetch("/admin/db-tools/backup/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Backup-Filename": encodeURIComponent(restoreFile.name),
          },
          body: restoreFile,
        });
        const uploadData = await uploadResponse.json();
        storedFilename = uploadData?.backup?.filename;
        if (!storedFilename) throw new Error("The uploaded backup did not return a stored filename.");
      }

      setStatus("Creating safety backup, restoring and validating data…");
      const response = await apiFetch("/admin/db-tools/restore", {
        method: "POST",
        body: JSON.stringify({
          backup_filename: storedFilename,
          audit_note: restoreReason.trim(),
        }),
      });
      const data = await response.json();
      setRestoreBackup("");
      setRestoreFile(null);
      setRestoreReason("");
      if (restoreInput.current) restoreInput.current.value = "";
      await refreshAll(true);
      setStatus(
        `Restore completed and activated for all users. Previous dataset: ${data.previous_db}. Safety backup: ${data.pre_restore_backup}.`
      );
      if (data.warnings) setWarning(`Restore completed with a database compatibility warning: ${data.warnings}`);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setStatus("");
    } finally {
      setRestoring(false);
    }
  };

  const switchDataset = async (target: string) => {
    if (!switchReason.trim()) {
      setError("Enter an audit reason before changing the active dataset.");
      return;
    }
    if (!window.confirm(`Set ${target} as the active dataset for all users?`)) return;
    setSwitchingTo(target);
    setError("");
    try {
      await apiFetch("/admin/db-tools/datasets/switch", {
        method: "POST",
        body: JSON.stringify({ db_name: target, audit_note: switchReason.trim() }),
      });
      setSwitchReason("");
      await refreshAll(true);
      setStatus(`Active dataset changed to ${target}.`);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setSwitchingTo("");
    }
  };

  const setMaintenanceMode = async (enabled: boolean) => {
    setTogglingMaintenance(true);
    setError("");
    try {
      const response = await apiFetch("/admin/db-tools/maintenance", {
        method: "POST",
        body: JSON.stringify({ enabled, reason: maintReason.trim() }),
      });
      setMaintenance((await response.json()) as MaintenanceState);
      setMaintReason("");
      setStatus(enabled ? "Maintenance mode enabled." : "Maintenance mode disabled.");
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setTogglingMaintenance(false);
    }
  };

  return (
    <div className="card">
      <div
        className="card-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
      >
        <div>
          <div className="card-title">Database Backup & Recovery</div>
          <div className="card-subtitle">Automatic protection, verified manual backups and guided recovery.</div>
        </div>
        <button type="button" className="btn" disabled={loading || restoring} onClick={() => void refreshAll()}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="info-row" style={{ marginTop: 10, color: "#fecaca", whiteSpace: "pre-wrap" }}>
          <b>Error:</b> {error}
        </div>
      ) : null}
      {warning ? (
        <div className="info-row" style={{ marginTop: 10, color: "#fde68a", whiteSpace: "pre-wrap" }}>
          <b>Warning:</b> {warning}
        </div>
      ) : null}
      {status ? (
        <div className="info-row" style={{ marginTop: 10, color: "#d1fae5", whiteSpace: "pre-wrap" }}>
          {status}
        </div>
      ) : null}

      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontSize: 17, fontWeight: 900 }}>Automatic Daily Backup</div>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Times use {settings?.timezone || "Europe/London"}</div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            alignItems: "end",
            marginTop: 14,
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 42, fontWeight: 800 }}>
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(event) => setScheduleEnabled(event.target.checked)}
            />
            Automatic backups enabled
          </label>
          <label>
            <div style={fieldLabelStyle}>Run every day at</div>
            <input
              type="time"
              className="input"
              value={scheduleTime}
              onChange={(event) => setScheduleTime(event.target.value)}
            />
          </label>
          <label>
            <div style={fieldLabelStyle}>Keep automatic backups</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min={1}
                max={3650}
                className="input"
                value={retentionDays}
                onChange={(event) => setRetentionDays(event.target.value)}
              />
              <span style={{ opacity: 0.75 }}>days</span>
            </div>
          </label>
          <button type="button" className="btn primary" disabled={savingSettings} onClick={() => void saveSchedule()}>
            {savingSettings ? "Saving…" : "Save Settings"}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 10,
            marginTop: 14,
          }}
        >
          <div className="info-row">
            <div style={fieldLabelStyle}>Next scheduled backup</div>
            <b>{scheduleEnabled ? formatDateTime(settings?.next_run_at_local) : "Disabled"}</b>
          </div>
          <div className="info-row">
            <div style={fieldLabelStyle}>Last automatic result</div>
            <b>{settings?.scheduler?.last_result || "Waiting for first run"}</b>
          </div>
          <div className="info-row">
            <div style={fieldLabelStyle}>Last successful automatic backup</div>
            <b>{formatDateTime(settings?.scheduler?.last_success_at_utc)}</b>
          </div>
        </div>
        {settings?.scheduler?.last_error ? (
          <div style={{ marginTop: 10, color: "#fecaca", fontSize: 13 }}>{settings.scheduler.last_error}</div>
        ) : null}
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: 17, fontWeight: 900 }}>Backup Location</div>
        <div style={{ marginTop: 9, fontSize: 16, fontWeight: 800 }}>{mono(hostLocation)}</div>
        <div style={{ marginTop: 7, fontSize: 13, opacity: 0.78, lineHeight: 1.5 }}>
          This is a physical folder on the Stock Control server, outside the Docker container. To browse to a different
          local drive or approved network location, open <b>ESC Backup Settings</b> on the Windows server. The utility
          validates the folder before applying it to both manual and automatic backups.
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: 17, fontWeight: 900 }}>Create a Manual Backup</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginTop: 12 }}>
          <input
            className="input"
            value={manualReason}
            onChange={(event) => setManualReason(event.target.value)}
            placeholder="Optional note, e.g. Before software update"
          />
          <button
            type="button"
            className="btn primary"
            disabled={creatingBackup || restoring}
            onClick={() => void createBackupNow()}
          >
            {creatingBackup ? "Creating verified backup…" : "Back Up Now"}
          </button>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontSize: 17, fontWeight: 900 }}>Restore a Backup</div>
          <div style={{ fontSize: 12, opacity: 0.72 }}>One confirmation • automatic safety backup • automatic activation</div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
            marginTop: 12,
          }}
        >
          <div>
            <div style={fieldLabelStyle}>Choose a physical backup file</div>
            <input
              ref={restoreInput}
              type="file"
              accept=".dump,application/octet-stream"
              className="input"
              onChange={(event) => {
                const selected = event.target.files?.[0] || null;
                setRestoreFile(selected);
                if (selected) setRestoreBackup("");
              }}
            />
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
              Or select <b>Use for restore</b> beside a stored backup below.
            </div>
          </div>
          <div>
            <div style={fieldLabelStyle}>Selected backup</div>
            <div className="info-row" style={{ minHeight: 42, display: "flex", alignItems: "center" }}>
              {restoreFile?.name || restoreBackup || "No backup selected"}
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginTop: 12 }}>
          <input
            className="input"
            value={restoreReason}
            onChange={(event) => setRestoreReason(event.target.value)}
            placeholder="Restore reason / change, deviation or incident reference (required)"
          />
          <button
            type="button"
            className="btn primary"
            disabled={restoring || creatingBackup}
            onClick={() => void runRestore()}
          >
            {restoring ? "Restoring and validating…" : "Restore and Activate"}
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.76, lineHeight: 1.5 }}>
          The current dataset is not overwritten. A pre-restore backup is created, the selected backup is restored into
          an internally named recovery database, required tables are checked, and it becomes active only after validation.
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontSize: 17, fontWeight: 900 }}>Available Backups</div>
          <div style={{ fontSize: 12, opacity: 0.72 }}>{backupRows.length} file(s) • active dataset {mono(activeDb)}</div>
        </div>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Backup</th>
                <th>Type</th>
                <th>Created</th>
                <th>Created by</th>
                <th>Size</th>
                <th>Integrity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backupRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>{loading ? "Loading backups…" : "No backups found in the configured folder."}</td>
                </tr>
              ) : (
                backupRows.map((backup) => {
                  const manifest = backup.manifest || {};
                  const created = manifest.completed_at_utc || manifest.created_at_utc || backup.modified_at_utc;
                  return (
                    <tr key={backup.filename}>
                      <td style={{ minWidth: 250 }}>{mono(backup.filename)}</td>
                      <td>{manifest.backup_type || "Legacy"}</td>
                      <td style={{ minWidth: 165 }}>{formatDateTime(created)}</td>
                      <td>{manifest.created_by || "—"}</td>
                      <td>{formatBytes(backup.size_bytes)}</td>
                      <td>{manifest.sha256 ? "SHA-256 manifest" : "Legacy / unchecked"}</td>
                      <td style={{ minWidth: 360 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                          <button type="button" className="btn" onClick={() => void downloadDump(backup.filename)}>
                            Download
                          </button>
                          {backup.manifest ? (
                            <button type="button" className="btn" onClick={() => void openManifest(backup.filename)}>
                              Details
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn"
                            onClick={() => void verifyStoredBackup(backup.filename)}
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setRestoreBackup(backup.filename);
                              setRestoreFile(null);
                              if (restoreInput.current) restoreInput.current.value = "";
                              setStatus(`Selected for restore: ${backup.filename}`);
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

      <details style={sectionStyle}>
        <summary style={{ cursor: "pointer", fontSize: 16, fontWeight: 900 }}>Advanced Recovery Controls</summary>
        <div style={{ marginTop: 14, fontSize: 13, opacity: 0.8 }}>
          These controls are retained for rollback and technical recovery. Normal restores activate the verified recovery
          dataset automatically.
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900 }}>Maintenance Mode</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, marginTop: 8 }}>
            <input
              className="input"
              value={maintReason}
              onChange={(event) => setMaintReason(event.target.value)}
              placeholder="Optional maintenance reason"
            />
            <button
              type="button"
              className="btn"
              disabled={togglingMaintenance || maintenance?.enabled}
              onClick={() => void setMaintenanceMode(true)}
            >
              Enable
            </button>
            <button
              type="button"
              className="btn"
              disabled={togglingMaintenance || !maintenance?.enabled}
              onClick={() => void setMaintenanceMode(false)}
            >
              Disable
            </button>
          </div>
          <div style={{ marginTop: 7, fontSize: 12, opacity: 0.75 }}>
            Current status: <b>{maintenance?.enabled ? "ON" : "OFF"}</b>
            {maintenance?.reason ? ` • ${maintenance.reason}` : ""}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 900 }}>Recovery Datasets</div>
          <input
            className="input"
            style={{ marginTop: 8 }}
            value={switchReason}
            onChange={(event) => setSwitchReason(event.target.value)}
            placeholder="Audit reason required before manually changing the active dataset"
          />
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table className="table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Internal database</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(datasets?.datasets || []).map((database) => {
                  const isActive = database === activeDb;
                  return (
                    <tr key={database}>
                      <td>{mono(database)}</td>
                      <td>{isActive ? <b>ACTIVE</b> : "Available for rollback"}</td>
                      <td>
                        {!isActive ? (
                          <button
                            type="button"
                            className="btn"
                            disabled={!!switchingTo || maintenance?.enabled}
                            onClick={() => void switchDataset(database)}
                          >
                            {switchingTo === database ? "Switching…" : "Set active"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 900 }}>System Information</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
              marginTop: 8,
            }}
          >
            <div className="info-row">
              <div style={fieldLabelStyle}>Application version</div>
              <b>{info?.app?.version || "—"}</b>
            </div>
            <div className="info-row">
              <div style={fieldLabelStyle}>Active database</div>
              <b>{mono(activeDb)}</b>
            </div>
            <div className="info-row">
              <div style={fieldLabelStyle}>Database size</div>
              <b>{formatBytes(info?.database?.size_bytes)}</b>
            </div>
            <div className="info-row">
              <div style={fieldLabelStyle}>PostgreSQL</div>
              <b>{info?.database?.postgres_version || "—"}</b>
            </div>
          </div>
        </div>
      </details>

      {manifestOpen ? (
        <div className="modal-overlay" onMouseDown={() => setManifestOpen(false)}>
          <div className="modal" onMouseDown={(event) => event.stopPropagation()} style={{ maxWidth: 820 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Backup Details</div>
                <div className="modal-subtitle">{manifestTitle}</div>
              </div>
              <button type="button" className="btn" onClick={() => setManifestOpen(false)}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  padding: 14,
                  borderRadius: 12,
                  background: "rgba(2, 6, 23, 0.58)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(manifestJson, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
