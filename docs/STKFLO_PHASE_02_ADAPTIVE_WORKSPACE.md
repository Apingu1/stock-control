# StkFlo — Phase 02 Adaptive Workspace & Density

**Branch:** feature/stkflo-adaptive-layout-phase-02
**Parent:** feature/stkflo-design-system-phase-01
**Scope:** layout, scrolling, device-local density and Settings typography. **No API, SQL, permissions, stock calculation, audit, or modal-data changes.**

## User experience

The StkFlo interface uses the available browser viewport rather than physical monitor type or Chrome's zoom. The sidebar and login retain their approved branding. Signed-in pages gain a persistent bottom margin so the primary rounded card remains visually contained.

The centre of the top bar has a View control: **Auto / Compact / Comfortable**. This setting is stored in the browser, not the stock-control database.

- **Auto:** default; compact on shorter viewports (840px height or less), balanced at typical sizes, more comfortable spacing on taller wide displays.
- **Compact:** saves vertical and horizontal space for laptop work without making the form text unreadable.
- **Comfortable:** larger spacing/control targets on generous displays.
- The operator can switch between choices without reloading or losing form data.
- Changing monitors or resizing the browser automatically recalculates the Auto layout through CSS media and container queries; no custom zoom is applied.

The desktop top bar keeps New Material, New Goods Receipt and New Consumption available. The display-density selection is separate from business permissions.

## Layout contract

1. The signed-in workspace main area uses viewport-height sizing with a reserved **16–26px lower gutter** depending on density. Login and sidebar are not restyled.
2. The Dashboard uses a contained flex layout. Eight KPIs compact on low-height screens. Alert and batch widgets use their remaining room and scroll internally.
3. For narrower main content, KPI columns collapse and the Dashboard becomes scrollable rather than hiding data.
4. Materials Library, Goods Receipts, Consumption, Live Lots and Product List preserve table-only internal scrolling while the parent card closes with a visible rounded bottom.
5. Page content is bounded to a generous maximum width on ultrawide displays instead of endlessly stretching a table.
6. Native date picker buttons, ordinary focus indications, modal centring, GMP validation, stock values and posting behaviour remain unchanged.

## Settings typography correction

Backup & Recovery section headings now use the same 16px StkFlo heading style as the rest of the application instead of hard-coded 17px/900-weight typography. Labels, ordinary inputs, tables and buttons inherit the shared StkFlo font. Long filesystem paths and machine identifiers intentionally retain monospaced text for clarity.

**The Settings page's structural redesign is still reserved for Phase 04.**

## Build and automated checks

Run from Codespaces:

    cd /workspaces/stock-control
    git fetch origin
    git switch feature/stkflo-adaptive-layout-phase-02
    bash scripts/restart_stack.sh
    cd web
    npm run check:design-system
    npm run check:adaptive-layout
    npm run build

No migrations or new database bootstrap are needed.

## Visual acceptance — at 100% browser zoom

| Screen/window | Expected |
|---|---|
| 1366 × 768 laptop | Auto uses compact KPI sizes; Dashboard bottom edge and margin remain visible; alert/batch lists scroll if needed |
| 1280 × 1024 square display | Balanced fit; wrapped controls and no table/page horizontal overshoot |
| 1920 × 1080 widescreen | Four KPI columns; two dashboard widgets; balanced bottom margin |
| 3440 × 1440 ultrawide | Comfortable spacing; page contents bounded and centred |
| Narrow window below 900px | Existing mobile drawer remains usable; filters and top-bar controls wrap; page can scroll |
| Extremely short window below 650px | Dashboard can scroll rather than clipping important information |

Additional checks:

1. Switch Auto → Compact → Comfortable and back. No lost form data.
2. Reload page. Selected mode persists on this browser.
3. Resize from laptop to widescreen in Auto. The layout responds without needing refresh.
4. Visit Materials Library, Goods Receipts, Consumption, Live Lots and Product List. Each primary panel retains rounded bottom corners and a bottom gutter.
5. Open New Goods Receipt, New Consumption, New Material and Change Lot Status. Confirm modal placement, calendar indicators and form state.
6. Visit Settings → Backup & Recovery. Verify matching font and section headings; backup/scheduler/restore controls remain operational.
7. Verify login and sidebar are visually unchanged from Phase 01.
8. Verify keyboard navigation and text remains legible at Windows display scaling 100%, 125% and 150%.
9. Confirm no horizontal browser-wide scrolling or clipped New Product/Export action.

**Status:** Implementation and static-contract checks are not substitutes for live browser/operational validation. Record browser size, system zoom, actual result and screenshot if any test fails.

## Deferred

Phase 03: operational page information architecture, filter toolbars and refined workflow UI.
Phase 04: Analytics/Admin/Settings/Backup full visual and component redesign.
Phase 05: Workspace Dock and independent draft windows.
