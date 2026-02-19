/**
 * Admin Settings
 *
 * NOTE (Phase Q1): Auto-quarantine threshold settings have moved to:
 *   Risk & Quality → Quarantine → Thresholds
 *
 * This page is reserved for broader system settings (database/backup controls, etc.)
 * which will be implemented in a future phase.
 */
export default function AdminSettingsView() {
  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Settings</div>
            <div className="card-subtitle">System-level configuration (Admin only)</div>
          </div>
        </div>

        <div className="info-row">
          Auto-quarantine thresholds have moved to <b>Risk &amp; Quality → Quarantine</b>.
        </div>

        <div className="info-row" style={{ fontSize: 12, opacity: 0.85 }}>
          Next planned features for this page:
          <ul style={{ margin: "8px 0 0 18px" }}>
            <li>Database info (name, size, schema version)</li>
            <li>Backups (create/download) and restore safeguards</li>
            <li>Optional: workspace database profiles (advanced)</li>
          </ul>
        </div>
      </section>
    </section>
  );
}
