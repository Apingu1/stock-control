# App Shell (App.tsx + hooks + layout)

## Core responsibilities

The app shell composes the application and coordinates:

1. **Auth bootstrap**
2. **Permissions bootstrap**
3. **Data loading**
4. **View routing and layout**
5. **Modal orchestration**

## Key files

### `src/App.tsx`
Primary composition layer:
- Boots session (token -> `/auth/me`)
- Loads permissions (`/auth/my-permissions`)
- Loads app datasets (`/lot-balances/`, `/materials/`, `/materials/expiry-thresholds`, `/receipts/`, `/issues/`)
- Manages active `view` and modal open/close
- Passes permission booleans into views/modals

### `src/hooks/useAuth.ts`
Session bootstrap state:
- `me: UserMe | null`
- `authChecked: boolean`
- `showLogin: boolean`
- Utilities:
  - `bootstrap()` (optional helper; App.tsx can use direct boot logic)
  - `handleLoggedIn()`
  - `logout()`

Important behaviours:
- If there is no token -> show login.
- If `/auth/me` fails -> clear token -> show login.

### `src/hooks/usePermissions.ts`
UX permission layer:
- Loads `/auth/my-permissions`
- Exposes `hasPerm(permissionCode)` for UI gating.
- Server remains authoritative for enforcement.

Typical permissions used:
- `admin.full`
- `lots.status_change`
- `receipts.edit`
- `issues.edit`
- `materials.super_edit_locked_fields`
- `receipts.super_edit_locked_fields`
- `issues.super_edit_locked_fields`
- `audit.view`

### `src/hooks/useStockData.ts`
Centralises stock datasets + loader flags:
- Data:
  - `materials`
  - `lotBalances`
  - `receipts`
  - `issues`
  - `expiryThresholds`
- Loading flags + errors:
  - `loadingLots`, `lotsError`
  - `loadingReceipts`, `receiptsError`
  - `loadingIssues`, `issuesError`
- Loaders:
  - `loadLotBalances()`, `loadMaterials()`, `loadReceipts()`, `loadIssues()`, `loadExpiryThresholds()`
  - `loadAll()` runs the main bootstrap set in parallel.

### `src/hooks/useAlertsBadge.ts`
Computes the sidebar badge for Low Stock & Expiry:
- Reads suppression actions from localStorage key `sc_alert_actions_v1`
- Suppressed actions (`state === "NOT_REQUIRED"`) are excluded from badge counts
- Listens to:
  - `window.storage` (cross-tab updates)
  - a custom event `sc_alert_actions_changed` (same-tab updates)

### `src/components/layout/Sidebar.tsx`
Navigation + account summary:
- Uses computed permission booleans to show/hide:
  - Admin menu items
  - Audit entry (disabled if not permitted)
- Displays alerts badge counts from `useAlertsBadge`.

### `src/components/layout/TopBar.tsx`
Header + top action buttons:
- `New Material`, `New Goods Receipt`, `New Consumption`
- Buttons are disabled if not signed in.

## Data flow overview

1. App mounts
2. If token exists:
   - `/auth/me` -> `me`
   - `/auth/my-permissions` -> `permissions`
   - `loadAll()` -> app data sets
3. Views render from `view` state
4. Modals post to API then trigger targeted reloads (e.g. new receipt -> reload receipts + lots)

## Extension points

- Add new `view` values in `types.ts` (ViewMode) + add a new Sidebar entry + a main render branch in App.tsx.
- Add new datasets to `useStockData()` and include in `loadAll()` when needed.
