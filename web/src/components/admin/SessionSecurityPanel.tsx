import { useEffect, useState } from "react";
import { apiFetch, fetchSessionSettings } from "../../utils/api";

const TIMEOUT_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120];

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Failed to update the inactivity timeout";

export default function SessionSecurityPanel() {
  const [timeoutMinutes, setTimeoutMinutes] = useState(15);
  const [savedTimeoutMinutes, setSavedTimeoutMinutes] = useState(15);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await fetchSessionSettings();
      const value = Number(settings.inactivity_timeout_minutes) || 15;
      setTimeoutMinutes(value);
      setSavedTimeoutMinutes(value);
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!reason.trim()) {
      setError("Enter a reason for changing this security setting.");
      return;
    }
    if (timeoutMinutes === savedTimeoutMinutes) {
      setError("Choose a different inactivity duration before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiFetch("/admin/session-settings", {
        method: "PUT",
        body: JSON.stringify({
          inactivity_timeout_minutes: timeoutMinutes,
          edit_reason: reason.trim(),
        }),
      });
      const saved = (await response.json()) as { inactivity_timeout_minutes: number };
      setTimeoutMinutes(saved.inactivity_timeout_minutes);
      setSavedTimeoutMinutes(saved.inactivity_timeout_minutes);
      setReason("");
      setSuccess(`Automatic logout is now set to ${saved.inactivity_timeout_minutes} minutes.`);
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title">Automatic logout</div>
          <div className="card-subtitle">
            Users are signed out after this period without keyboard, pointer or touch activity.
            Closing the browser session also requires a new login.
          </div>
        </div>
        <button className="btn" type="button" onClick={() => void load()} disabled={loading || saving}>
          Refresh
        </button>
      </div>

      <div className="card-body">
        <div className="form-grid" style={{ alignItems: "end" }}>
          <div className="form-group">
            <label className="label" htmlFor="session-timeout-minutes">Inactivity duration</label>
            <select
              id="session-timeout-minutes"
              className="input"
              value={timeoutMinutes}
              disabled={loading || saving}
              onChange={(event) => {
                setTimeoutMinutes(Number(event.target.value));
                setError(null);
                setSuccess(null);
              }}
            >
              {TIMEOUT_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: "span 2" }}>
            <label className="label" htmlFor="session-timeout-reason">Reason for change</label>
            <input
              id="session-timeout-reason"
              className="input"
              value={reason}
              disabled={loading || saving}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required for the audit trail"
            />
          </div>

          <div className="form-group" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-primary" type="button" onClick={save} disabled={loading || saving}>
              {saving ? "Saving…" : "Save timeout"}
            </button>
          </div>
        </div>

        {error && <div className="error-row">{error}</div>}
        {success && <div className="info-row">{success}</div>}
      </div>
    </section>
  );
}
