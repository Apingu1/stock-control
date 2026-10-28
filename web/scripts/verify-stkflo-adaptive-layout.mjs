/**
 * Phase 02 static regression contract.
 * A browser smoke test remains mandatory for viewport/scroll behaviour.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
let failures = 0;
function check(label, condition) {
  process.stdout.write((condition ? "PASS" : "FAIL") + ": " + label + "\n");
  if (!condition) failures += 1;
}
const css = read("src/styles/stkflo-adaptive.css");
const app = read("src/App.tsx");
const bar = read("src/components/layout/TopBar.tsx");
const utils = read("src/utils/workspaceDensity.ts");
const settings = read("src/components/admin/DbToolsPanel.tsx");
const main = read("src/main.tsx");
const settingPage = read("src/components/admin/AdminSettingsView.tsx");
check("Workspace density applied on signed-in shell", app.includes('data-density={density}'));
check("Default preference is Auto", utils.includes('DEFAULT_DENSITY: WorkspaceDensity = "auto"'));
check("Preferences stored device-locally", utils.includes("localStorage.setItem") && utils.includes("localStorage.getItem"));
check("Invalid saved mode falls back safely", utils.includes("isWorkspaceDensity(saved)") && utils.includes("catch {"));
check("Density selectable in toolbar", bar.includes("onDensityChange") && bar.includes("Workspace display density"));
for (const mode of ["auto", "compact", "comfortable"]) {
  check("Mode " + mode + " is selectable", bar.includes('value="' + mode + '"'));
}
check("Adaptive CSS loaded after Phase 01 components", main.indexOf("stkflo-adaptive.css") > main.indexOf("stkflo-components.css"));
check("Short laptop viewport auto-compact", css.includes("@media (max-height: 840px)"));
check("Large widescreen auto-comfortable", css.includes("(min-height: 980px) and (min-width: 1660px)"));
check("Responsive dashboard uses container queries", css.includes("@container sf-workspace (max-width: 880px)"));
check("Panel has reserved lower margin", css.includes("padding: var(--sf-page-gutter-top) var(--sf-page-gutter-x) var(--sf-page-gutter-bottom)"));
check("No arbitrary browser zoom or scaled interactions", !/\bzoom\s*:|transform\s*:\s*scale\s*\(/.test(css));
check("Dashboard and table scroll areas remain accessible", css.includes("overflow-y: auto") && css.includes(".table-wrapper"));
check("Settings page uses shared typography", settingPage.includes("stkflo-settings-page") && css.includes("sf-settings-section-title"));
check("Backup section headings no longer override 17px/900", !settings.includes('style={{ fontSize: 17, fontWeight: 900 }}'));
check("Date-picker styles and login are not overridden here", !css.includes(".stkflo-login-panel") && !css.includes("calendar-picker-indicator"));
check("CSS braces balanced", (css.match(/\{/g) ?? []).length === (css.match(/\}/g) ?? []).length);
process.exitCode = failures ? 1 : 0;
