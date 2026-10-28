# StkFlo Design System — Phase 01

Status: Foundation implementation — requires Codespaces build and visual acceptance
Baseline: feature/stkflo-stock-integrity-validation
Branch: feature/stkflo-design-system-phase-01
Scope: visual tokens, reusable UI components and compatibility styling; no API/DB/stock logic changes.

## Visual direction

The approved StkFlo login defines the visual identity. Its midnight navy base, raised slate-blue panel, subtle light borders, indigo-to-violet gradient, cyan details, off-white primary text, muted blue-grey support text and rounded rectangular input fields are the reference.

The approved login and StkFlo sidebar have NOT been redesigned. New styles apply to the signed-in workspace, its shared controls, status treatments and modal overlays.

## Source files

- web/src/styles/stkflo-tokens.css — canonical --sf-* colour, type, spacing and surface tokens
- web/src/styles/stkflo-components.css — shared component styles and legacy-class compatibility layer
- web/src/components/ui/StkFloUI.tsx — reusable typed presentational components
- web/src/components/ui/index.ts — public exports
- web/scripts/verify-stkflo-design-system.mjs — lightweight contract checks
- web/src/main.tsx — stylesheet import order, after legacy and branding
- web/src/components/modals/CsvExportModal.tsx — initial component-library adoption

## Token palette

| Usage | CSS variable | Value |
|---|---|---|
| Canvas | --sf-bg-canvas | #08132c |
| Shell | --sf-bg-shell | #0b1428 |
| Surface | --sf-bg-surface | #14243b |
| Raised surface | --sf-bg-surface-raised | #1c2a42 |
| Field background | --sf-bg-field | #0c192e |
| Primary text | --sf-text-primary | #f8fafc |
| Secondary text | --sf-text-secondary | #a1afc6 |
| Indigo | --sf-indigo | #6366f1 |
| Violet | --sf-violet | #8b5cf6 |
| Cyan | --sf-cyan | #06b6d4 |
| Primary gradient | --sf-accent-gradient | #5b5ff0 to #7456e9 |
| Control radius | --sf-radius-control | 10px |
| Card radius | --sf-radius-card | 16px |

Use only the named design tokens on new screens. Legacy variables such as --bg, --card-bg and --text-primary have temporary compatibility mappings.

The font stack uses locally available Inter followed by system UI fonts; StkFlo does not require external font downloads or web resources.

## Reusable React primitives

Import from web/src/components/ui:

- StkFloPanel: semantic surface with optional eyebrow, heading, description and actions
- StkFloButton: primary/secondary/ghost/danger, with native button semantics and a safe default type of button
- StkFloBadge: neutral/info/success/warning/danger
- StkFloField: associated label, hint and accessible error message
- StkFloInput, StkFloSelect, StkFloTextarea: styled native form elements

Use controlled input values and existing data handlers. Do not move stock validation into presentational components. A StkFloField must supply a matching htmlFor and input id.

The existing .card, .btn, .input, .tag, .table and .modal classnames are styled through a compatibility layer for gradual adoption.

## Visual and functional acceptance

In Codespaces:

    cd /workspaces/stock-control
    git switch feature/stkflo-design-system-phase-01
    git pull --ff-only origin feature/stkflo-design-system-phase-01
    cd web
    npm ci
    npm run check:design-system
    npm run build

Then test in browser at 100% zoom:

1. Approved login and sidebar look unchanged.
2. Shared cards, inputs, buttons, tables and status indicators have consistent StkFlo colours, typography, rounded corners and focus styles.
3. CSV Export modal opens with working native date selectors, Cancel and Export buttons.
4. Goods Receipts, Consumption, Material creation and Live Lots still work as before.
5. Quarantine change modal remains correctly positioned and usable.
6. Analytics and Backup & Recovery remain functional even though their structural overhaul belongs to Phase 04.
7. Keyboard focus is clearly visible; warning/error colours retain their meaning.
8. Page widths, heights and scrolling remain unaffected (adaptive density comes later).

This is a test plan, not evidence that the commands were executed.

## CSS migration rules

1. Do not change or override the approved login design.
2. Do not introduce new arbitrary colour codes in future pages; use the --sf-* variables.
3. Prefer the typed React primitives to one-off inline CSS on new or refactored screens.
4. Keep stock, audit, security and permissions logic independent of the design layer.
5. Keep the native calendar picker styling and avoid reducing control legibility.
6. Respect reduced-motion preferences and preserve visible keyboard focus.

## Deferred phases

- Phase 02: adaptive Auto / Compact / Comfortable density and balanced viewport margins
- Phase 03: page-by-page operational workflow UX
- Phase 04: Analytics, Admin, Audit, Settings and Backup UI alignment
- Phase 05: Workspace Dock, modal minimisation and multiple independent drafts

Do not merge into the operational branch before the frontend build and manual stock-workflow smoke tests pass.
