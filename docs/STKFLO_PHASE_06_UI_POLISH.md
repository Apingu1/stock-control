# StkFlo — Phase 06 UI Refinements

Branch: feature/stkflo-ui-polish-product-bmr-phase-06  
Based on: feature/stkflo-workspace-dock-phase-05  
Date: 29 October 2026  
Scope: Frontend and visual changes only. No database, stock valuation, posting or audit backend changes.

## Implemented

1. Sidebar: Analytics moved below Live Lots. The existing sidebar permissions remain unchanged.
2. Analytics: removed the extra page heading and Traceable decoration; breadcrumbs, Search/Explore, date range and reports are grouped in one compact StkFlo panel. Separate report sections remain visually distinct within it.
3. Material Analytics: the green identifier chip displays material code and material name together when the API name is available.
4. New Product BMR: new white header action before New Material, gated by products.create. It opens the existing Product List creation form, including all mandatory materials and audit-reason requirements.
5. Workspace Dock: the Product BMR form is now a fourth independent draft type. It supports minimise, restore, discard, multiple independent instances and in-memory draft persistence across StkFlo pages. Existing Product editing stays separate.
6. Calendar controls: native Chrome/Edge date picker indicators are made white, including Goods Receipts, Consumption, Analytics, Audit and other signed-in date controls.
7. Top bar: the clock and View density selector are centred in the space between the page title and action buttons, with a responsive wrap for narrower windows.
8. Alerts: fixed scroll jumping by moving the render-local alert wrapper outside the parent component, preventing React remounting on each alert update. Standardised one main vertical scroller.
9. Sidebar low stock/expiry counter: amber/orange badge matching alert severity styling.
10. Audit Trail: compact five-field filter row at generous widths (Date From, Date To, Event Type, Actor, Search); wraps at narrower widths.
11. Analytics and Settings main panels: start at the same level as the operational pages, without a separate large heading above.
12. Consumption modal: header and footer now match the premium slate-blue modal surface and border design.

## Important boundaries

- The New Product BMR button uses the existing Product List create form. It does not add a new Digital Manufacturing BMR system or change the product master schema.
- The backend remains authoritative for product creation permissions, audit logging, material membership and validation.
- Drafts remain memory-only (not retained across browser reload/logout) by design. The existing Phase 05 revalidation of materials, products and permissions is retained.
- No stock quantities, inventory movements, cost calculations, receipt/issue endpoints, database bootstrap or GMP audit trail behaviour have been changed.
- Alerts suppressions, thresholds, display filters and alert actions were not rewritten. The scroll issue was traced to unstable React component identity.
- No existing Product List edit behaviour was removed.

## Run in GitHub Codespaces

    cd /workspaces/stock-control
    git fetch origin
    git switch feature/stkflo-ui-polish-product-bmr-phase-06
    cd web
    npm run check:design-system
    npm run check:adaptive-layout
    npm run check:operational-ui
    npm run check:admin-analytics-ui
    npm run check:workspace-dock
    npm run check:ui-polish
    npm run build

A successful Vite build and direct browser tests are required for deployment.

## Browser acceptance

- [ ] Confirm sidebar order and amber alert count.
- [ ] Analytics dashboard begins at the same height as Materials Library; Search/Explore and date range are inside a unified card; no Traceable chip.
- [ ] Analytics Material details display both material code and material name prominently.
- [ ] Verify analytical CSV/PDF exports, Search/Explore and Batch/Product/Material drilldowns.
- [ ] New Product BMR appears as a white topbar button and opens the current Product List create form.
- [ ] Fill Product BMR draft, minimise, navigate, create another and restore both without losing values.
- [ ] Verify creating a product (with required audit reason) removes its draft, while existing Edit remains functional.
- [ ] Verify products.create permission hides creation from unauthorised operators.
- [ ] Date-picker icons are clearly visible across Goods Receipt, Consumption, Analytics, Audit and every other date entry.
- [ ] Date/time and View controls align in the middle of their available topbar region on laptop, square and widescreens.
- [ ] Audit Trail Search joins the four filter fields on a wide display; Apply/Clear/page size/export still work.
- [ ] Scroll the Alerts list halfway down; leave it open while data updates. It must remain at the same scroll position.
- [ ] Alerts page still shows rounded bottom and preserves action/suppression behaviour.
- [ ] Settings starts level with the other main page panels.
- [ ] Consumption modal header/footer now match other modal backgrounds in create and edit views.
- [ ] Check 100% Chrome zoom at laptop, square and widescreen monitor sizes.
- [ ] Re-check modal typing and close/cancel confirmations from the Phase 05 fixes.

Status: Code committed; TypeScript/Vite build and browser acceptance require Codespaces execution before merging.
