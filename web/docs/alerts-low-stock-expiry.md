# Alerts: Low Stock & Low Expiry

## Purpose

Provides a unified alert view for:
- Low stock materials (available quantity <= configured threshold)
- Low expiry lots (days_to_expiry <= configured alert days)

Includes:
- local suppression workflow for alert items ("NOT_REQUIRED")
- badge counts shown in Sidebar

## Key files

### `src/hooks/useAlertsBadge.ts`
Computes alert badge counts used in the Sidebar.

Inputs:
- `materials`
- `lotBalances`

Suppression:
- Reads localStorage key: `sc_alert_actions_v1`
- Any alert key with state `NOT_REQUIRED` is excluded from counts

Update events:
- `storage` event for cross-tab updates
- custom `sc_alert_actions_changed` for same-tab updates when the app writes localStorage

Alert keys:
- Low stock: `LOW_STOCK::<material_code>`
- Low expiry: `LOW_EXPIRY::<material_code>::<lot_number>`

### `src/components/alerts/LowStockExpiryView.tsx`
Renders:
- Low stock section/table/list
- Low expiry section/table/list
- Launches modal(s) for managing suppressed items (if present in your alerts folder)

It should use the same alert key scheme so badge counts and suppression stay consistent.

### `src/components/alerts/alertsStore.ts`
LocalStorage persistence wrapper (if present):
- load actions map
- write actions map
- optionally dispatch `sc_alert_actions_changed` event after write

### `src/components/alerts/SuppressedModal.tsx`
UI for viewing/restoring suppressed alerts:
- lets the user revert an alert from NOT_REQUIRED back to active states

## Data logic overview

### Low stock calculation
- Compute available quantity by material_code as the sum of AVAILABLE lot segments’ balances.
- If available <= `materials.low_stock_threshold_qty`, the material is considered low stock (unless suppressed).

### Low expiry calculation
- For each AVAILABLE lot segment with positive balance:
  - if lot has expiry_date
  - and material has `expiry_alert_days`
  - and `days_to_expiry <= expiry_alert_days`
  => low expiry (unless suppressed)

## Extension points

- If you later move suppression from localStorage to server:
  - keep the alert key scheme stable
  - replace alertsStore implementation; keep callers unchanged.
