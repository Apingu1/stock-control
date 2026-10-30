# StkFlo — Materials Library Import (v8)

## Purpose
Import all 522 source Material Master records from the legacy workbook into the Materials Library, **without** creating stock lots, opening receipts or historical consumption.

The upload is available at **Data Migration → Materials Library** on this feature branch, which is based directly on `feature/stkflo-bmr-master-formula-migration`. The Materials, Products & Master Formulas and Opening Stock workflows remain isolated.

## Source data and mapping
- Source: `Copy of Master Stock Control 2026 v8.xlsx`, tabs `Master_List`, `Purchased` and `Inventory Index`.
- Primary CSV: `StkFlo_Materials_Library_Import_v8.csv`, UTF-8 with BOM, 522 distinct material codes.
- `Master_List!Minimum Stock` → `low_stock_threshold_qty` directly in the material's quantity/base UOM.
- `expiry_alert_days` → **90** on every material.
- `Active` / `Discontinued` → `ACTIVE` / `INACTIVE`.
- Manufacturer and supplier are selected using the latest Purchased record where it contains both, otherwise the most frequently represented vendor pair in Inventory Index. The imported values are **historical metadata, not proof of approval**.
- StkFlo classifications are mapped to its controlled category/type policy and base UOM. Source discrepancies are identified in `review_notes`; do not assume these are verified.
- Three source minimum-stock cells were blank and remain null. The app does not invent a number.

## High-priority review before commit
- 19 material rows include `REVIEW REQUIRED` due to missing legacy categories/types, inconsistent units, or source classification mapping, including MAT0477.
- Many materials have multiple historical manufacturers or suppliers. A separate review CSV lists the alternatives and original Master_List row positions.
- 170 materials have no complete manufacturer/supplier pair in Purchased or Inventory Index. Missing fields remain empty.
- The importer accepts the `manufacturer_source`, `supplier_source`, and `review_notes` audit-reference columns but does not write them into the stock database.

## Import behavior
1. Sign in to a StkFlo instance with `data_migration.view` (or `admin.full`) permission.
2. Open Data Migration → Materials Library; upload the CSV and select Validate & Preview.
3. Review all blocking findings and the source review file, especially classification or unit changes, before approving.
4. Take a database backup, enter a formal approval/change reference, mark the review attestations, and type `IMPORT MATERIAL LIBRARY`.
5. Commit using `data_migration.commit` (or `admin.full`) permission.
6. Confirm the Materials Library counts, random-sample 90-day expiry-alert values, thresholds and suppliers/manufacturers, and archive the audit history.

Existing material codes are matched without replacing material name, classification, UOM, active status or manufacturer/supplier values already present. Missing existing manufacturer/supplier values are populated. Existing low-stock thresholds are updated when the CSV provides a number; a blank source threshold preserves the existing value. Existing expiry alert days are set to 90.

**This process does not certify historical manufacturers as approved suppliers, and does not set the GMP criteria flag true on newly created materials.**

### Windows VM and Codespaces
The feature is a browser/API workflow and functions the same on Codespaces and Windows Docker/VM deployments. The CSV stays on the computer from which it is selected. No manual file copy to Docker or database scripting is required.

Do not import the same catalogue into live production without QA review, validation and an approved controlled cutover.
