# StkFlo — Phase 03 Operational UI

**Branch:** `feature/stkflo-operational-ui-phase-03`
**Parent:** `feature/stkflo-adaptive-layout-phase-02`
**Scope:** Shared presentation patterns and usability for seven stock-control operational pages. No backend, SQL, calculation, permissions, or transaction-posting changes.

## Design

Phase 03 applies the Phase 01 midnight-navy and indigo design system and respects the Phase 02 Auto/Compact/Comfortable viewport rules. It deliberately does not change Chrome zoom or make table values less precise.

**Operational page standard**
- Small, consistent section eyebrow and page title.
- Clearly separated, wrapping search/filter/export actions.
- Matching record-count strip that distinguishes all results from filtered matches.
- Clear filters button appears only while filters are applied. It resets visible filter state but does not change or delete data.
- Common table header, hover, numeric typography, empty states and keyboard focus.
- Horizontal scrolling is confined to dense tables. Parent panels retain visible rounded bottom corners and the lower gutter from Phase 02.
- Quarantine and Alerts keep their specialist management functions and permissions.

## Screen-by-screen

| Page | Work completed |
|---|---|
| Materials Library | Generic StkFlo terminology, category/type/search toolbar, results count, clear filters, consistent material codes and tables |
| Product List | Product-master heading, seven responsive filters, results count and clear filters, consistent table presentation |
| Goods Receipts | Inbound-stock heading, search and filters, results count and clear filters, consistent lot/material identifiers |
| Consumption History | Traceability heading, batch/material filters, results count and clear filters, dense horizontally scrollable table |
| Live Lots | Inventory heading, category/type/status/expiry/search filtering, result count and clear filters, status/change actions retained |
| Quarantine | Shared heading, separated threshold/activity-log button controls, nested scrolling and styles while retaining access checks |
| Low Stock & Expiry | Clear monitoring heading, responsive suppression/search/filter toolbar and consistent alert-card treatments |

The original lot-number-only predictive search **within the Consumption creation modal** is untouched. This does not limit the separate history-filter search.

## Acceptance tests

Run in Codespaces:

```bash
cd /workspaces/stock-control
git fetch origin
git switch feature/stkflo-operational-ui-phase-03
cd web
npm run check:design-system
npm run check:adaptive-layout
npm run check:operational-ui
npm run build
```

No database rebuild, schema migration or backend restart is required for this branch. Refresh the running Vite tab with Ctrl + Shift + R after switching.

**Functional checks:** Open each operational page; change each filter; confirm results match filters; use Clear filters and confirm all records return. CSV exports must still respect their previous selected-filter and date-range behaviour. Test creation/editing and permissions for Materials, Goods Receipts, Consumption and Lot Status, as well as Products; no business logic should change. The Quarantine thresholds and activity log, and alert suppression, must continue working.

**Display checks (100% browser zoom):** 1366×768 laptop, 1280×1024 square display, 1920×1080 widescreen and 3440×1440 ultrawide. Check page bottom padding, toolbar wrapping, table-only overflow, sticky headers, focus visibility, no horizontal scrolling of the whole browser, and that live values remain legible at six decimals. Check Auto, Compact and Comfortable. Screen-size testing remained outstanding from Phase 02 when this phase was started.

## Deferred

Analytics, Settings/Backup & Recovery and Audit Trail structural redesign remain Phase 04. The Workspace Dock, minimised modals and independently retained drafts remain Phase 05.

**Validation status:** Code committed. Static source checks can be run via the included npm script; browser build, responsive visual testing and operational acceptance remain to be carried out in the target Codespace.
