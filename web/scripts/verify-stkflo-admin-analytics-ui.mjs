/** Parse every modified screen with the installed TypeScript parser.
 * Full npm run build remains the authoritative type/build validation.
 */
import ts from "typescript";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
let errors = 0;
function check(name, pass) {
  process.stdout.write((pass ? "PASS: " : "FAIL: ") + name + "\n");
  if (!pass) errors++;
}
const files = {
  settings: "src/components/admin/AdminSettingsView.tsx",
  session: "src/components/admin/SessionSecurityPanel.tsx",
  recovery: "src/components/admin/DbToolsPanel.tsx",
  users: "src/components/admin/AdminUsersView.tsx",
  audit: "src/components/audit/AuditTrailView.tsx",
  analytics: "src/components/analytics/AnalyticsView.tsx",
  dashboard: "src/components/analytics/DashboardPanel.tsx",
  product: "src/components/analytics/ProductPanel.tsx",
  material: "src/components/analytics/MaterialPanel.tsx",
  batch: "src/components/analytics/BatchPanel.tsx",
  analyticsSearch: "src/components/analytics/SearchModal.tsx",
};
const pages = {};
for (const [name, path] of Object.entries(files)) {
  const raw = read(path);
  pages[name] = raw;
  const parsed = ts.createSourceFile(path, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const d of parsed.parseDiagnostics) {
    const pos = parsed.getLineAndCharacterOfPosition(d.start ?? 0);
    process.stderr.write(path + ":" + (pos.line + 1) + ":" + (pos.character + 1) + ": " + ts.flattenDiagnosticMessageText(d.messageText, " ") + "\n");
  }
  check(name + " TSX syntax", parsed.parseDiagnostics.length === 0);
}
const main = read("src/main.tsx");
const css = read("src/styles/stkflo-admin-analytics.css");
check("CSS load order", main.indexOf("stkflo-admin-analytics.css") > main.indexOf("stkflo-operational.css"));
check("CSS braces match", (css.match(/\{/g) ?? []).length === (css.match(/\}/g) ?? []).length);
check("No browser zoom or transform scaling", !/\bzoom\s*:|transform\s*:\s*scale\s*\(/.test(css));
check("Settings panels preserved", pages.settings.includes("<SessionSecurityPanel") && pages.settings.includes("<DbToolsPanel"));
check("Session timeout audit reason preserved", pages.session.includes("session-timeout-reason") && pages.session.includes("onClick={save}"));
check("Backup scheduling, manual backup and restore preserved", ["saveSchedule()", "createBackupNow()", "runRestore()", "setMaintenanceMode("].every(x => pages.recovery.includes(x)));
check("Restore has distinct visual warning", pages.recovery.includes("sf-phase4-restore-action") && css.includes(".sf-phase4-restore-action"));
check("Advanced recovery remains collapsible", pages.recovery.includes("<details") && pages.recovery.includes("Advanced Recovery Controls"));
check("Users/Roles native navigation", pages.users.includes('aria-pressed={tab === "users"}') && pages.users.includes('aria-pressed={tab === "roles"}'));
check("RBAC permissions still editable", pages.users.includes("savePermissions") && pages.users.includes("createRole") && pages.users.includes("Permission matrix"));
check("Audit filters and diff stay available", pages.audit.includes("diffJson") && pages.audit.includes("handleApply") && pages.audit.includes("handleExportPdf"));
check("Audit responsive filter grid", pages.audit.includes("sf-phase4-audit-filters") && css.includes(".sf-phase4-audit-filters"));
check("Analytics drilldowns unchanged", ["DashboardPanel", "BatchPanel", "ProductPanel", "MaterialPanel", "SearchModal"].every(x => pages.analytics.includes(x)));
check("Analytics date inputs accessible", pages.analytics.includes('htmlFor="sf-analytics-from"') && pages.analytics.includes('id="sf-analytics-from"') && pages.analytics.includes('htmlFor="sf-analytics-to"') && pages.analytics.includes('id="sf-analytics-to"'));
check("Phase 02 density layout untouched", !css.includes(".app-shell[data-density="));
check("Login/sidebar styling untouched by Phase 04 CSS", !css.includes(".stkflo-login-panel") && !css.includes(".stkflo-sidebar"));
process.exitCode = errors ? 1 : 0;
