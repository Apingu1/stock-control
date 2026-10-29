import DbToolsPanel from "./DbToolsPanel";
import SessionSecurityPanel from "./SessionSecurityPanel";

export default function AdminSettingsView() {
  return (
    <section className="content stkflo-settings-page sf-phase4-settings">
      <div className="sf-phase4-settings-stack">
        <SessionSecurityPanel />
        <DbToolsPanel />
      </div>
    </section>
  );
}
