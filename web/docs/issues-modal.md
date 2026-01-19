# Consumption / Issues Modal (IssueModal)

## Purpose

Creates or edits a consumption transaction ("issue") against a specific lot.

Supports:
- Create issue (POST)
- Edit issue (PUT) with audit reason
- Lot selection and traceability
- Consumption types affecting required fields

## Key files

### `src/components/modals/IssueModal.tsx`
Container/orchestrator:
- Validates required fields
- Builds API payload for create vs edit
- Applies superuser rules:
  - in edit mode, can optionally allow changing material/lot if `canSuperEditLockedFields` is true

Endpoints:
- `POST /issues/`
- `PUT /issues/{id}`

Payload fields commonly included:
- `material_code`, `lot_number`, `material_lot_id`
- `qty`, `uom_code`
- `consumption_type`
- `es_product_code` (may be null)
- `product_batch_no`, `product_manufacture_date` (conditional)
- `comment`
- `edit_reason` (edit only)

### `src/components/modals/issues/useIssueForm.ts`
Form state + initialisation + derived logic:
- Material typeahead search
- Lot list derived from `lotBalances` for selected material
- Derived booleans:
  - `isBatchRequired` (USAGE)
  - `isBatchOptional` (R_AND_D)
  - `isBatchIrrelevant` (WASTAGE/DESTRUCTION)
  - `showBatchFields`
- Locking rule:
  - `canEditTraceabilityFields` is false when editing unless superuser.

### `src/components/modals/issues/issueHelpers.ts`
- `ConsumptionTypeCode` union type
- `formatDateShort()` for lot expiry display
- `rankLotStatus()` to sort AVAILABLE first, then QUARANTINE, then REJECTED

### `src/components/modals/issues/IssueTraceabilityFields.tsx`
UI for:
- consumption type dropdown
- material search/typeahead and selection
- lot selection dropdown
- quarantined warning banner

### `src/components/modals/issues/IssueProductFields.tsx`
UI for:
- qty
- manufacturer info
- optional product fields (ES product code, batch, manufacture date)
- comment
- edit reason (edit mode)

## Behaviour rules (important)

- **Consumption type rules**
  - USAGE: batch number required
  - R_AND_D: batch fields optional
  - WASTAGE/DESTRUCTION: batch fields hidden/irrelevant
  - DESTRUCTION: comment required

- **Edit reason**
  - Required on edit (audit trail)

- **Traceability locking**
  - Normal edit: material/lot are fixed
  - Superuser edit: material/lot may be changed (still audit-trailed)

- **Lot sorting**
  - AVAILABLE segments displayed first
  - Then QUARANTINE
  - Then REJECTED
