/**
 * Lightweight design-system contract check. No network or dependencies.
 * The frontend build (npm run build) is the authoritative TS/Vite check.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => readFileSync(join(root, name), "utf8");
let failures = 0;
function ensure(condition, message) {
  if (!condition) {
    failures += 1;
    process.stderr.write("FAIL: " + message + "\n");
  } else process.stdout.write("PASS: " + message + "\n");
}
const tokenPath = "src/styles/stkflo-tokens.css";
const componentPath = "src/styles/stkflo-components.css";
const primitivePath = "src/components/ui/StkFloUI.tsx";
for (const p of [tokenPath, componentPath, primitivePath, "src/components/ui/index.ts"]) {
  ensure(existsSync(join(root, p)), "File exists: " + p);
}
if (failures) process.exit(1);

const tokens = load(tokenPath);
const css = load(componentPath);
const ui = load(primitivePath);
const main = load("src/main.tsx");
const brand = load("src/stkflo.css");
for (const name of [
  "--sf-bg-canvas", "--sf-bg-surface", "--sf-bg-field",
  "--sf-indigo", "--sf-violet", "--sf-cyan", "--sf-text-primary",
  "--sf-font-family", "--sf-border-focus", "--sf-radius-card",
  "--sf-accent-gradient", "--sf-shadow-modal",
]) ensure(tokens.includes(name + ":"), "Design token: " + name);

for (const name of ["StkFloButton", "StkFloPanel", "StkFloBadge", "StkFloField", "StkFloInput", "StkFloSelect", "StkFloTextarea"]) {
  ensure(ui.includes("function " + name + "("), "Reusable React primitive: " + name);
}
ensure(!tokens.includes("@import") && !css.includes("@import"), "No external stylesheet or font imports");
ensure(brand.includes(".stkflo-login-media") && brand.includes(".stkflo-sidebar"), "Approved login and sidebar styling remains intact");
const order = [
  'import "./index.css";',
  'import "./stkflo.css";',
  'import "./styles/stkflo-tokens.css";',
  'import "./styles/stkflo-components.css";',
].map((x) => main.indexOf(x));
ensure(order.every((x) => x >= 0) && order.every((x, i) => i === 0 || x > order[i-1]), "Legacy -> branding -> design tokens -> components CSS order");
ensure(css.includes(".app-shell:not(.stkflo-auth-shell)") && css.includes(".modal .input"), "Scoped signed-in and portal form styles");
for (const [name, content] of [[tokenPath, tokens],[componentPath, css]]) {
  const open = (content.match(/\{/g) ?? []).length, close = (content.match(/\}/g) ?? []).length;
  ensure(open === close, "Balanced CSS blocks: " + name);
}
process.exitCode = failures ? 1 : 0;
