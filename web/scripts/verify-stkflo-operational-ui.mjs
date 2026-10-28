/**
 * Static Phase 03 regression guard; run npm run check:operational-ui.
 * A full frontend build and visual/operational browser test remain mandatory.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
let failures = 0;
const check = (message, valid) => {
  process.stdout.write((valid ? "PASS" : "FAIL") + ": " + message + "\n");
  if (!valid) failures++;
};

const paths = {
  materials: "src/components/materials/MaterialsLibraryView.tsx",
  receipts: "src/components/receipts/GoodsReceiptsView.tsx",
  consumption: "src/components/issues/ConsumptionView.tsx",
  lots: "src/components/lots/LiveLotsView.tsx",
  products: "src/components/products/ProductListView.tsx",
  quarantine: "src/components/quarantine/QuarantineView.tsx",
  alerts: "src/components/alerts/LowStockExpiryView.tsx",
};
const pages = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, read(path)]));
const main = read("src/main.tsx");
const css = read("src/styles/stkflo-operational.css");
const resultBar = read("src/components/ui/OperationalResultBar.tsx");

check("Phase 03 styling loaded after adaptive styling",
  main.indexOf("stkflo-operational.css") > main.indexOf("stkflo-adaptive.css"));
check("Responsive CSS blocks balanced",
  (css.match(/\{/g) ?? []).length === (css.match(/\}/g) ?? []).length);
check("No resizing browser zoom or native date picker changes",
  !/\bzoom\s*:|transform\s*:\s*scale\s*\(|calendar-picker-indicator/.test(css));
check("Shared result summary and explicit filter reset", resultBar.includes('aria-live="polite"')
  && resultBar.includes('onClear()') && resultBar.includes('type="button"'));
for (const key of ["materials", "receipts", "consumption", "lots", "products"]) {
  const page = pages[key];
  check(key + " uses unified operational styling", page.includes("sf-operational-page")
    && page.includes("sf-ops-eyebrow") && page.includes("sf-ops-table"));
  check(key + " shows count and allows clearing filters",
    page.includes("<OperationalResultBar") && page.includes("onClear={() =>"));
}
check("Quarantine policy and activity log unchanged",
  pages.quarantine.includes("ThresholdsTab") && pages.quarantine.includes("LogTab")
  && pages.quarantine.includes("sf-ops-secondary-page"));
check("Quarantine buttons expose selected state to accessibility tools",
  pages.quarantine.includes('aria-pressed={tab === "thresholds"}')
  && pages.quarantine.includes('aria-pressed={tab === "log"}'));
check("Alerts keep suppression and both alert panels",
  pages.alerts.includes("LowStockPanel") && pages.alerts.includes("LowExpiryPanel")
  && pages.alerts.includes("SuppressedModal") && pages.alerts.includes("sf-alerts-page"));
check("Material/receipt/consumption/lot filters have names",
  ["materials", "receipts", "consumption", "lots"].every((key) =>
    pages[key].includes('aria-label="Filter') && pages[key].includes('aria-label="Search')));
check("Live Lots retains quarantine change action",
  pages.lots.includes("LotStatusModal") && pages.lots.includes("canChangeStatus"));
check("Consumption preserves lot-number-only suggestion code",
  read("src/components/modals/BatchIssueCreateModal.tsx")
    .includes(".filter((lot) => lot.lot_number.toLowerCase().includes(query))"));
check("Dashboard/Phase 02 sizing is not replaced",
  !css.includes(".metrics-row") && !css.includes(".stkflo-login"));
process.exitCode = failures ? 1 : 0;
