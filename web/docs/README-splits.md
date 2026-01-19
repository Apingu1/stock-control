# Split Modules Guide (Developer Notes)

This folder contains short technical notes for recently modularised areas of the frontend.

## Contents

- `app-shell.md`
  - App bootstrap, auth/permissions, data loading, view routing, layout composition.

- `materials-modal.md`
  - Material create/edit modal: form rules, D4 thresholds, approved manufacturers staging.

- `receipts-modal.md`
  - Goods receipt create/edit modal: total-cost pricing model, tablets/caps manufacturer enforcement.

- `issues-modal.md`
  - Consumption (Issue) create/edit modal: lot selection, consumption types, edit auditing.

- `alerts-low-stock-expiry.md`
  - Low stock + low expiry screens, suppression state model, storage events, badge counts integration.

## Conventions used in these modules

- **Server is authoritative** for permission enforcement; frontend uses `/auth/my-permissions` for UX gating only.
- **Audit trail / edit reason** is required on edit operations (modal-specific rules described in each doc).
- **Split pattern**
  - Container file: orchestrates API calls + composes UI.
  - Hook file: owns state/init/derived values.
  - Helper(s): small pure functions (formatting, calculations, ranking).
  - UI subcomponents: dumb components receiving props.
