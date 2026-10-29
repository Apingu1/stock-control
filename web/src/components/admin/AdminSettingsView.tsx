import DbToolsPanel from "./DbToolsPanel";
import SessionSecurityPanel from "./SessionSecurityPanel";
import OpeningStockMigrationPanel from "./OpeningStockMigrationPanel";

export default function AdminSettingsView() {
  return (
    <section className="content">
      <SessionSecurityPanel />
      <DbToolsPanel />
      <OpeningStockMigrationPanel />
    </section>
  );
}
