# StkFlo — Phase 04: Analytics, Administration & Audit UI

**Branch:** `feature/stkflo-admin-analytics-ui-phase-04`  
**Parent:** `feature/stkflo-operational-ui-phase-03`  
**Scope:** Frontend presentation, typography, responsive layout, control hierarchy and accessibility.

Phase 04 brings the previously inconsistent Analytics, Audit Trail, Users & Roles, Session Security and Database Backup & Recovery screens into the approved StkFlo design system. It preserves existing application logic, server permissions, backups, restores, audit records, stock valuations and exports.

## Completed work

| Screen | UI improvements | Existing function retained |
|---|---|---|
| Analytics | Premium workspace heading, unified breadcrumb/search command bar, labelled date selectors, consistent panels, KPI cards, tables and analytic search modal | Dashboard/Product/Material/Batch drill-down, dates, reports, CSV/PDF |
| Users & Roles | Shared section heading, responsive content, accessible native Users/Roles buttons instead of clickable chips, consistent permissions matrix/table styling | User management, role/permission matrix, server RBAC, password reset |
| Session Security | StkFlo section heading, consistent form and label appearance, responsive grid | Timeout selection, mandatory audit reason, save/refresh |
| Settings | Single administration header and visually unified Settings & Recovery sections | Both session and database panels |
| Backup & Recovery | Premium grouped sections, consistent labels and typography, readable paths and backup table, carefully differentiated restore action | Scheduling, manual backups, verification, manifest display, restore, maintenance and rollback |
| Audit Trail | Consistent header, adaptive filter grid, controlled scrollable table and readable details | Append-only events, query filters, event diffs, pagination, CSV/PDF |

### Safety and operational boundaries

- The **Restore and Activate** button has a distinctive amber treatment, not a routine purple Save appearance. This does not weaken confirmation, permissions or the existing safe-restore sequence.
- Advanced Recovery Controls remain collapsible and are not moved to another endpoint.
- The server remains authoritative for RBAC and database operations.
- Audit Trail is still read-only/append-only from the UI perspective.
- No API, SQL or server-side Python files were modified in this phase.
- The approved StkFlo login and sidebar remain untouched.
- Phase 02 Auto/Compact/Comfortable density stays functional.
- The Consumption creation modal's lot-number-only search is unaffected.

## Changes and maintenance guidance

New stylesheet: `web/src/styles/stkflo-admin-analytics.css` — imported last by `web/src/main.tsx`. This uses the established `--sf-*` tokens, scopes selectors to relevant screens and does not change other page logic.

Future Analytics and Admin work should use the shared `StkFloPanel`, `StkFloButton`, `StkFloInput` components and `--sf-*` variables rather than adding new inline font settings. Monospace remains appropriate for paths, SQL/technical identifiers and audit references.

## Installation / test

In Codespaces:

```bash
cd /workspaces/stock-control
git fetch origin
git switch feature/stkflo-admin-analytics-ui-phase-04
cd web

npm run check:design-system
npm run check:adaptive-layout
npm run check:operational-ui
npm run check:admin-analytics-ui
npm run build
```

The Phase 04 check parses **11 TSX files** with the installed TypeScript parser, then checks that important controls and their existing handlers remain present. A full `npm run build` is still required to detect type-level or bundling failures.

### Manual acceptance checklist

- [ ] Analytics Dashboard opens; Product, Batch and Material drill-down links still work.
- [ ] Search/Explore opens, searches and navigates; date-from/date-to inputs and native calendar icons work.
- [ ] CSV and PDF analytics exports still produce correct reports.
- [ ] Users & Roles buttons work by mouse and keyboard and indicate the selected section.
- [ ] User creation, status changes and password reset remain permission-controlled.
- [ ] Role creation, permission toggling and Save still work; backend RBAC remains authoritative.
- [ ] Session timeout can be edited with a required audit reason and persists after refresh.
- [ ] Automatic backup scheduling and manual backup continue to function.
- [ ] Backup manifest viewing, verification and available backup listing still work.
- [ ] Any actual restore testing happens **only in a disposable test dataset**, not against an operational database.
- [ ] Advanced Recovery Controls, maintenance mode and recovery dataset selection are still accessible to authorised administrators.
- [ ] Audit filters Apply/Clear, date selectors, pagination, details and CSV/PDF export still work.
- [ ] Laptop 1366×768, square 1280×1024, widescreen 1920×1080 and ultrawide layouts remain responsive at 100% browser zoom.
- [ ] Login, sidebar, ordinary operational pages and the Phase 02 View density selector are unchanged.

**Validation status:** Source-level verification was performed against committed GitHub files. Actual Codespaces frontend build and browser/workflow acceptance must be recorded before merging this branch.

## Next

Phase 05 is the proposed Workspace Dock: modal minimisation, restore, multiple independent drafts, unsaved-change confirmation and fresh stock/status validation at submission. No modal lifecycle logic was introduced in Phase 04.
