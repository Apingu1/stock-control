/**
 * Phase 05 draft-dock source regression: real TypeScript/TSX syntax parsing
 * plus core lifecycle and GMP safety invariants.
 * npm run build still required for type checking and bundling.
 */
import ts from "typescript";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
let errors = 0;
function check(label, passed) {
  process.stdout.write((passed ? "PASS: " : "FAIL: ") + label + "\n");
  if (!passed) errors++;
}
const files = {
  app: "src/App.tsx",
  dock: "src/components/layout/WorkspaceDock.tsx",
  receipt: "src/components/modals/NewReceiptModal.tsx",
  material: "src/components/modals/MaterialModal.tsx",
  issue: "src/components/modals/IssueModal.tsx",
  batch: "src/components/modals/BatchIssueCreateModal.tsx",
  types: "src/utils/workspaceDrafts.ts",
};
const source = {};
for (const [name, path] of Object.entries(files)) {
  const content = read(path);
  source[name] = content;
  const parsed = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  for (const diagnostic of parsed.parseDiagnostics) {
    const position = parsed.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    process.stderr.write(path + ":" + (position.line + 1) + ":" + (position.character + 1) + " " +
      ts.flattenDiagnosticMessageText(diagnostic.messageText, " ") + "\n");
  }
  check(name + " TypeScript/TSX syntax", parsed.parseDiagnostics.length === 0);
}

const css = read("src/styles/stkflo-workspace-dock.css");
const main = read("src/main.tsx");
check("Dock styling loaded after Phase 04", main.indexOf("stkflo-workspace-dock.css") > main.indexOf("stkflo-admin-analytics.css"));
check("CSS block braces balanced", (css.match(/\{/g) ?? []).length === (css.match(/\}/g) ?? []).length);
check("No browser zoom or transformed form interactions", !/\bzoom\s*:|transform\s*:\s*scale\s*\(/.test(css));
check("Separate per-instance drafts capped at eight", source.types.includes('WORKSPACE_DRAFT_LIMIT = 8') && source.app.includes("nextWorkspaceDraft("));
check("Drafts stay mounted while hidden", source.app.includes("drafts.map((draft)") && source.app.includes("sf-minimised-draft") &&
  source.app.includes("<NewReceiptModal open={true}") && source.app.includes("<IssueModal open={true}") &&
  source.app.includes("<MaterialModal open={true}"));
check("Dirty tracking bubbles after controlled inputs", source.app.includes('onChange={() => markDraftDirty(draft.id)}') &&
  !source.app.includes("onChangeCapture") && !source.app.includes("onInputCapture"));
check("Workspace Dock is rendered inside main viewport", source.app.indexOf("<WorkspaceDock drafts={drafts}") <
  source.app.indexOf("</main>"));
check("Dock supports restore, close and multiple copies", source.dock.includes("onRestore(draft.id)") &&
  source.dock.includes("onDiscard(draft.id)") && source.dock.includes('onNew("receipt")'));
check("No browser storage for form drafts", !source.types.includes("localStorage") && !source.types.includes("sessionStorage"));
check("Cancel requires confirmation when dirty", source.app.includes("draft.dirty && !window.confirm("));
check("Material close does not reset before confirmation", source.material.includes("const handleCancel = () => {") &&
  source.material.includes("onClose();") && !source.material.includes("am.setPendingRemoveIds(new Set());\n    am.setPendingAddNames([]);\n    am.setApprovedError(null);\n    setError(null);\n    onClose();"));
check("No minimise while posting", ["receipt","material","batch"].every((key) =>
  source[key].includes("onMinimize") && source[key].includes("disabled={submitting}")));
check("Consumption refreshes policy without resetting lines", source.batch.includes("if (!open || !active) return;") &&
  source.batch.includes("enabled: open && active"));
check("Form is inert throughout mandatory refresh", source.app.includes('inert={Boolean(validating)}') && source.app.includes('aria-hidden={Boolean(validating)}'));
check("Draft resume requires fresh successful API response", source.app.includes("const refreshDraft") &&
  source.app.includes('await Promise.all([...urls, "/auth/my-permissions"].map((url) => apiFetch(url)))') &&
  source.app.includes("sf-draft-validation-mask") && source.app.includes("Retry refresh"));
check("Stale post-logout refresh discarded", source.app.includes("draftSessionEpoch.current += 1") &&
  source.app.includes("epoch !== draftSessionEpoch.current"));
check("Stale submission callbacks ignored after logout", source.app.includes("if (!liveDraftIds.current.has(id)) return") &&
  source.app.includes("liveDraftIds.current.clear()"));
check("All drafts cleared on session expiry/logout", source.app.includes("setDrafts([])") &&
  source.app.includes("completedDraftIds.current.clear()"));
check("Beforeunload warning for unsaved work", source.app.includes('window.addEventListener("beforeunload", warn)'));
check("Edits remain outside the draft dock", source.app.includes("EXISTING-RECORD EDIT MODALS") &&
  source.app.includes("open={!!editingReceipt}") && source.app.includes("open={!!editingIssue}") &&
  source.app.includes("open={!!editingMaterial}"));
check("Existing lot-number-only consumption prediction retained", source.batch.includes("lot.lot_number.toLowerCase().includes(query)"));
check("Backend posting endpoints untouched", source.batch.includes('apiFetch("/issues/batch"') &&
  source.receipt.includes('apiFetch("/receipts/"') && source.material.includes('apiFetch("/materials/"'));
check("Footer dock reserves space in existing workspace", css.includes(".app-shell:has(.sf-workspace-dock) .main"));
check("Dock matches primary panel width", css.includes("position: absolute; z-index: 700") &&
  css.includes("max-width: var(--sf-content-max-width)") &&
  css.includes("left: var(--sf-page-gutter-x)") &&
  css.includes("right: calc(var(--sf-page-gutter-x) + 16px)") &&
  css.includes(".app-shell:not(.stkflo-auth-shell) .main { position: relative; }"));

process.exitCode = errors ? 1 : 0;
