import DbToolsPanel from "./DbToolsPanel";
import SessionSecurityPanel from "./SessionSecurityPanel";

export default function AdminSettingsView() {
  return (
    <section className="content stkflo-settings-page">
      <SessionSecurityPanel />
      <DbToolsPanel />
    </section>
  );
}
