import DbToolsPanel from "./DbToolsPanel";
import ServerManagementPanel from "./ServerManagementPanel";
import SessionSecurityPanel from "./SessionSecurityPanel";

export default function AdminSettingsView() {
  return (
    <section className="content stkflo-settings-page sf-phase4-settings">
      <div className="sf-phase4-settings-stack">
        <SessionSecurityPanel />
        <ServerManagementPanel />
        <DbToolsPanel />
      </div>
    </section>
  );
}
