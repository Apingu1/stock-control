# Material Modal (Materials Master Data)

## Purpose

`MaterialModal` supports:
- Creating a new material
- Editing an existing material
- Configuring D4 thresholds (low stock, low expiry, quarantine override)
- Managing approved manufacturers for TABLETS/CAPSULES materials (staged then applied on save)

## Key files

### `src/components/modals/MaterialModal.tsx`
Container/orchestrator:
- Calls the materials API to create/update the material record
- In edit mode:
  - Requires `edit_reason`
  - Applies staged approved-manufacturer additions and removals after the main material update
- Responsible for:
  - validation and error display
  - coordinating approved-manufacturer staging apply

Endpoints typically used:
- `POST /materials/`
- `PUT /materials/{material_code}`
- `GET /materials/{material_code}/approved-manufacturers`
- `POST /materials/{material_code}/approved-manufacturers`
- `DELETE /materials/{material_code}/approved-manufacturers/{id}`

### `src/components/modals/materials/MaterialFormFields.tsx`
Dumb UI component:
- Renders core master-data fields + D4 fields
- Applies locked-field gating:
  - Material name may be locked in edit mode unless `canSuperEditLockedFields` is true
- Accepts an injected `approvedManufacturersSection` node so the modal can conditionally render the section.

### `src/components/modals/materials/ApprovedManufacturersSection.tsx`
UI for tablets/caps approved manufacturer list:
- Only relevant when:
  - `mode === edit`
  - `category_code === TABLETS_CAPSULES`
- Supports staging:
  - mark existing entries for removal (pending set)
  - stage new manufacturer names for add (pending list)
- Staged changes apply only when the user saves the modal.

### `src/components/modals/materials/useApprovedManufacturers.ts`
Manages:
- existing list from API
- pending remove/add sets
- UI error states for that section

### `src/components/modals/materials/materialFormUtils.ts`
Pure helpers:
- numeric parsing helpers (`toNumOrEmpty`)
- normalize manufacturer names to avoid dupes
- detect whether quarantine override is enabled based on initial data

## Behaviour rules (important)

- **Edit reason**
  - In edit mode, `edit_reason` is required.
  - This reason also applies to approved-manufacturer changes in the same save action.

- **Staging**
  - Approved manufacturers are not mutated immediately.
  - Save action applies staged deletes then staged adds.

- **D4 override**
  - If override is disabled, `auto_quarantine_override_days` is sent as `null`.

- **Default threshold display**
  - Uses `expiryThresholds` (loaded in App) to show the configured default quarantine threshold for the chosen category+type.
