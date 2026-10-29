// Phase 06: parse all touched TSX with TypeScript and verify UI/permissions contracts.
// Follow with npm run build for full type checking and bundling.
import ts from "typescript";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
let failures = 0;
function check(label, ok) {
  process.stdout.write((ok ? "PASS: " : "FAIL: ") + label + "\n");
  if (!ok) failures++;
}
const files = {
  app: "src/App.tsx",
  sidebar: "src/components/layout/Sidebar.tsx",
  topbar: "src/components/layout/TopBar.tsx",
  dock: "src/components/layout/WorkspaceDock.tsx",
  productList: "src/components/products/ProductListView.tsx",
  productModal: "src/components/products/ProductModal.tsx",
  analytics: "src/components/analytics/AnalyticsView.tsx",
  material: "src/components/analytics/MaterialPanel.tsx",
  settings: "src/components/admin/AdminSettingsView.tsx",
  alerts: "src/components/alerts/LowStockExpiryView.tsx",
  audit: "src/components/audit/AuditTrailView.tsx",
  drafts: "src/utils/workspaceDrafts.ts",
};
const source = {};
for (const [name, path] of Object.entries(files)) {
  source[name] = read(path);
  const parsed = ts.createSourceFile(path, source[name], ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  for (const error of parsed.parseDiagnostics) {
    const pos = parsed.getLineAndCharacterOfPosition(error.start ?? 0);
    process.stderr.write(path + ":" + (pos.line + 1) + ":" + (pos.character + 1) + " " + ts.flattenDiagnosticMessageText(error.messageText, " ") + "\n");
  }
  check(name + " parses", parsed.parseDiagnostics.length === 0);
}
const css = read("src/styles/stkflo-ui-polish-phase-06.css");
const main = read("src/main.tsx");
check("Phase 06 CSS loaded last", main.indexOf("stkflo-ui-polish-phase-06.css") > main.indexOf("stkflo-workspace-dock.css"));
check("CSS block structure balanced", (css.match(/\{/g) ?? []).length === (css.match(/\}/g) ?? []).length);
check("Navigation order", source.sidebar.indexOf('item("analytics", "Analytics"') > source.sidebar.indexOf('item("lots", "Live Lots"'));
check("Alert counter amber", source.sidebar.includes("is-alert-count") && css.includes(".stkflo-nav-badge.is-alert-count"));
check("New Product BMR topbar white and permission gated", source.topbar.includes("New Product BMR") && source.topbar.includes("canCreateProduct") && css.includes(".sf-bmr-top-button"));
check("New Product BMR draft mounted and dock enabled", source.app.includes('draft.kind === "product"') && source.app.includes("<ProductModal open={true}") && source.dock.includes('onNew("product")'));
check("Product BMR create reuses existing audited form", source.productModal.includes("auditReason") && source.productModal.includes("onMinimize") && source.productModal.includes("materialIds"));
check("Product BMR refreshes permissions and reference data", source.app.includes('kind === "product"') && source.app.includes('["/materials/", "/products/"]') && source.app.includes('"/auth/my-permissions"'));
check("Product List existing edits preserved", source.productList.includes("setEditing(product)") && source.productList.includes("<ProductModal"));
check("Analytics has compact single outer panel", source.analytics.includes("sf-analytics-unified-panel") && source.analytics.includes("sf-analytics-inline-dates") && !source.analytics.includes('header className="sf-phase4-page-heading"'));
check("No Traceable decoration in analytics", !source.analytics.includes("Traceable"));
check("Material analytics shows code plus name", source.material.includes("title ?") && source.material.includes("materialCode") && source.material.includes("Chip variant="));
check("Settings extra header removed", !source.settings.includes('sf-phase4-page-heading') && source.settings.includes("DbToolsPanel"));
check("Native calendar glyphs white", css.includes("::-webkit-calendar-picker-indicator") && css.includes("brightness(0) invert(1)"));
check("Time and density controls centred", css.includes(".top-bar-center") && css.includes("justify-content: center"));
check("Audit filter search joins row", css.includes("grid-template-columns: minmax(125px") && css.includes(".sf-phase4-audit-filters .sf-phase4-audit-search"));
check("Alerts scroll wrapper stable across rerenders", source.alerts.indexOf("const AlertsShell") >= 0 && source.alerts.indexOf("const AlertsShell") < source.alerts.indexOf("const LowStockExpiryView") && !source.alerts.includes("const Shell: React.FC"));
check("Alerts single vertical scroller", css.includes(".sf-alerts-scroll-container") && source.alerts.includes("<AlertsShell>"));
check("Consumption modal header/footer match slate", css.includes(".modal.issue-batch-modal .issue-batch-header") && css.includes(".modal.issue-batch-modal .issue-batch-footer"));
process.exitCode = failures ? 1 : 0;
