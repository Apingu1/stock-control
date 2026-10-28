import DbToolsPanel from "./DbToolsPanel";
import SessionSecurityPanel from "./SessionSecurityPanel";

export default function AdminSettingsView() {
  return (
    <section className="content stkflo-settings-page sf-phase4-settings">
      <header className="sf-phase4-page-heading">
        <div className="sf-phase4-eyebrow">WORKSPACE ADMINISTRATION</div>
        <h1 className="sf-phase4-page-title">Settings &amp; Recovery</h1>
        <p className="sf-phase4-page-description">Session protection, verified backups and controlled recovery.</p>
      </header>
      <div className="sf-phase4-settings-stack">
        <SessionSecurityPanel />
        <DbToolsPanel />
      </div>
    </section>
  );
}
