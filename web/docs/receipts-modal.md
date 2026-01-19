# Goods Receipt Modal (NewReceiptModal)

## Purpose

Creates or edits a goods receipt line and updates stock lots via backend transaction logic.

Supports:
- Create receipt (POST)
- Edit receipt (PUT) with required audit reason
- Total cost entry model (unit cost derived)
- Manufacturer enforcement for TABLETS/CAPSULES materials via approved manufacturers list

## Key files

### `src/components/modals/NewReceiptModal.tsx`
Container/orchestrator:
- Validates required fields
- Builds payloads for create/edit
- Calls API and triggers `onReceiptPosted()` callback

Create endpoint:
- `POST /receipts/`

Edit endpoint:
- `PUT /receipts/{id}`

Important payload design:
- UI captures `total_value` ("Total cost £")
- Backend derives `unit_price = total_value / qty` (unit_price may be null in request)

### `src/components/modals/receipts/useReceiptForm.ts`
Form state + derived values:
- Maintains create vs edit initialisation
- Derives:
  - `lockTraceabilityFields` (edit mode and not superuser)
  - `isTabletsCaps` (material category)
  - `approvedForMaterial` list (from `selectedMaterial.approved_manufacturers`)
  - `calculatedUnitCost` (display-only)

### `src/components/modals/receipts/receiptHelpers.ts`
- `calcUnitCost(qty, totalCost)` used for live unit cost display.

### `src/components/modals/receipts/ReceiptCoreFields.tsx`
UI for:
- material typeahead
- lot number
- expiry date
- qty
- receipt date (locked in edit)
- total cost + calculated unit cost display

Traceability locking:
- In edit mode, `lot_number` and `expiry_date` are locked unless `canSuperEditLockedFields`.

### `src/components/modals/receipts/ReceiptManufacturerFields.tsx`
UI for:
- supplier
- manufacturer
Tablets/caps rule:
- If material is TABLETS/CAPSULES: manufacturer must be selected from approved list.
- If no approved manufacturers exist, receipt is blocked and UI prompts to configure them in Materials.

### `src/components/modals/receipts/ReceiptComplianceFields.tsx`
Create mode:
- checkbox “Complies with ES criteria”
Edit mode:
- shows edit reason field and requires it

## Behaviour rules (important)

- **Create validations**
  - must select material
  - qty required
  - receipt date required
  - total cost required
  - compliance checkbox required
  - tablets/caps: manufacturer must be approved + selected

- **Edit validations**
  - edit reason required
  - traceability fields are locked unless superuser permission is present
  - total cost required (consistent costing model)

- **Derived pricing**
  - UI shows calculated unit cost for user feedback only.
  - Backend is authoritative for stored `unit_price`.
