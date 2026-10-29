# StkFlo Phase 05 — Workspace Dock & Multi-Draft Forms

**Feature branch:** `feature/stkflo-workspace-dock-phase-05`  
**Based on:** `feature/stkflo-admin-analytics-ui-phase-04`  
**Scope:** Frontend session-only modal lifecycle and workspace presentation. No database, API or stock transaction schema modifications.

## What operators can do

1. Open **New Goods Receipt**, **New Consumption** or **New Material**.
2. Enter data, then click the **− Minimise** button in the modal heading.
3. Continue working on another StkFlo page.
4. Restore the draft by selecting it from the bottom **Workspace drafts** bar.
5. Start another independent draft of the same type (e.g. a second Goods Receipt) from the top bar or the dock.
6. Complete a form normally, or discard it using Close/Cancel or the dock's × action.

Each draft has an identity and independently mounted React component instance. Minimising **does not set** the form's existing `open` prop to false; therefore the old useEffect initialise/reset routines do **not** wipe a minimised draft. Instead its wrapper is visually hidden and the component remains mounted. Up to **eight drafts** may be open in one browser tab. The dock is only displayed when drafts are minimised and no other modal is active.

## Data handling and GMP safeguards

- Drafts are **memory-only**. No stock data or form fields are persisted in browser storage, across browser reloads, or on the backend.
- A standard browser warning appears on reload/closing the tab if any draft has unsaved field changes.
- Closing a changed draft explicitly asks for discard confirmation. Declining leaves entries unchanged.
- Signing out or being signed out for inactivity clears all drafts. Signing out manually asks for confirmation if changed drafts exist; automatic session expiry always wins.
- An in-flight refresh from a prior authenticated session cannot repopulate new-session stock state.
- **Before new or restored draft interaction**, the app calls the existing API to refresh the relevant material/expiry/lot/product data. It blocks the form behind a verification mask until successful.
- If a refresh fails, the user can **Retry refresh** or minimise the draft. The draft cannot be posted using unchecked stale data via the UI.
- The form is marked **inert** while checking, preventing mouse clicks, keyboard submission and assistive-technology access to controls beneath the refresh overlay.
- Quarantine policy is refreshed on Consumption restore; selected lot objects follow fresh lot-balances responses.
- The backend remains authoritative on expiry, status, stock availability, permissions, duplicate batch prevention and inventory ledger posting at submission time.
- The dock does not bypass existing submit handlers, prompts or compliance checks.
- Editing an existing Goods Receipt, Consumption transaction or Material stays a single-instance workflow; edit windows are not duplicated to avoid conflicting updates.
- A successfully posted draft is removed without incorrectly showing a discard prompt.
- Existing form state and user selections remain independent across concurrently mounted drafts.

## Design and accessibility

The dock uses the approved navy/slate/indigo StkFlo tokens and dynamically reserves space below the main panel to keep the rounded lower edge visible. The same design works with Phase 02 Auto, Compact and Comfortable densities. Dock controls are native buttons with descriptive accessible labels; the minimise icon cannot be used during a posting operation.

## Verification

On the new branch in Codespaces:

```bash
cd /workspaces/stock-control
git fetch origin
git switch feature/stkflo-workspace-dock-phase-05
cd web
npm run check:design-system
npm run check:adaptive-layout
npm run check:operational-ui
npm run check:admin-analytics-ui
npm run check:workspace-dock
npm run build
```

### Functional acceptance matrix

| Case | Action | Expected |
|---|---|---|
| D01 | Enter receipt material/lot/date/qty/cost, minimise and restore | All fields retained; fresh stock/reference data checked |
| D02 | Start receipt A, minimise, start receipt B, minimise, restore A | Independent field values and lot selections |
| D03 | Add multiple Consumption material and packaging lines, minimise and restore | Every line retained, including quantities and cancelled/rejected flags |
| D04 | Create New Material with category/type/UOM, minimise, navigate, restore | Data retained and compliant mapping still enforced |
| D05 | Close a dirty draft then cancel the confirmation | Draft remains open and all entries unchanged |
| D06 | Discard from the dock | Confirmation shown for dirty entries; discard removes only selected draft |
| D07 | Post receipt/consumption or save material | Successful draft disappears; no duplicate posting or discard confirmation |
| D08 | Start 8 drafts, attempt ninth | Explicit limit message; existing drafts preserved |
| D09 | Minimise draft then open and edit an existing record | Existing edit works; original draft remains in dock |
| D10 | Logout with drafts | User confirmation; server logout clears all draft state |
| D11 | Trigger inactivity/session expiry | All drafts removed; no data carried into a new login |
| D12 | Refresh browser with unsaved work | Browser warning; drafts are not claimed to persist after reload |
| D13 | Restore when API unavailable | Draft blocked by verification mask; Retry/Minimise available |
| D14 | Restore after another user quarantines/consumes selected stock | Fresh lot availability displayed; backend rejects invalid posting |
| D15 | Standard lot-number-only consumption prediction | Remains limited to matching lot numbers |
| D16 | Verify date icons and responsive modal layouts on all monitor sizes | Existing styles and calendar buttons retained |

**Do not use a production database to test restore, deliberate permission changes or unsafe inventory scenarios.** Test posting against the disposable Codespaces dataset. Browser and monitor-size tests have not been run by GitHub source editing; they remain required before deployment.

## Known boundaries

This is **not** a server-side persistent draft system. Refreshing or closing the browser discards unfinished values after the browser's warning. Existing-record edit forms, Product List modals, lot-status change dialogs, Analytics search and backup/recovery dialogs are deliberately not included in the multi-draft dock. Additional form types can be added after validating this controlled workflow.

The browser holds each draft component while minimised. Its background requests and resource use may continue, but the Consumption quarantine-policy polling is paused while hidden and resumed when restored.

## Phase 05 follow-up — modal input and dock width

Reported after initial testing (29 October 2026): New Material, Goods Receipt and Consumption create forms were unable to accept typed values. Phase 05 had added two capture-phase handlers (`onInputCapture` and `onChangeCapture`) on every draft wrapper, which could update the parent while React controlled inputs were processing their own events. Dirty tracking now uses a single bubbling `onChange` handler, so it runs after the input's own handler. The click handler for selection buttons also uses the bubbling phase.

The Workspace Dock was originally positioned relative to the window, with an independent 1120px maximum width. It is now rendered **inside the responsive main workspace**, positioned relative to that workspace and capped by the same `--sf-content-max-width` variable as page panels. The right inset also accounts for the content panel's reserved 16px scrollbar gutter, keeping its outer edges aligned with the main rounded page card.

### Focused acceptance checks

- New Material: type name, manufacturer, supplier, numeric thresholds. Ensure every keystroke appears, dropdowns remain selectable and the draft is marked Unsaved changes.
- Goods Receipt: type a lot number, quantity and total cost, select dates, minimise and restore. Confirm fields retain values.
- Consumption: enter batch identifiers, search lot numbers, add a material/packaging line, type quantities and minimise/restore. Confirm typed text is not lost.
- Compare left/right edges of Workspace Dock with the Dashboard's main panel at 100% Chrome zoom on laptop, square screen and widescreen.
- Test dirty-draft Cancel confirmation both accepted and declined.
- Run `npm run check:workspace-dock` and `npm run build` before merging.

These corrections have been committed, but runtime testing in Codespaces remains required.
