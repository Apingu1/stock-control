import DbToolsPanel from "./DbToolsPanel";
import SessionSecurityPanel from "./SessionSecurityPanel";

export default function AdminSettingsView() {
  return (
    <section className="content">
      <SessionSecurityPanel />
      <DbToolsPanel />
    </section>
  );
}
