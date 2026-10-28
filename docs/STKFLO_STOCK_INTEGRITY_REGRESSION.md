# StkFlo — Stock Integrity & Classification Regression Checks

Branch: `feature/stkflo-stock-integrity-validation` (based on `feature/stkflo-rebrand`)

## Deployment note

This change is intended for the **test** database. Back up any test data that needs keeping before applying the updated bootstrap. The database bootstrap version has advanced to `production-schema-v6-stkflo-inventory-integrity`; deployment reruns the controlled SQL scripts and recreates application read-model views, then widens `stock_transactions.qty` to six decimals. Do not run the bootstrap against an operational database without a reviewed change plan.

Check the schema after deployment:

```sql
SELECT column_name, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = 'stock_transactions' AND column_name = 'qty';
-- Expected: numeric_precision=18, numeric_scale=6
```

## Functional acceptance matrix

| ID | Test | Expected outcome |
|---|---|---|
| F1-01 | Receipt 1.000000 L; consume 0.000001 L | History records 0.000001 L; Live Lots shows 0.999999 L |
| F1-02 | Enter more than six decimal places | API rejects invalid precision |
| F4-01 | Receive a lot with cost £3.44 and use part of quantity; move balance AVAILABLE → QUARANTINE → AVAILABLE | Remaining quantity and financial value do not change because of status moves |
| F4-02 | Split and merge the physical lot into existing status segments | Per-segment and combined values reconcile; cost basis preserved |
| F2-01 | Attempt direct API batch consumption with MG for L-based material | HTTP 400, UOM mismatch; no stock movement |
| F2-02 | Attempt edit to an issue's UOM | HTTP 400 for conflicting UOM |
| F2-03 | Attempt change of material base UOM after a receipt | HTTP 409; no reinterpreted historical stock |
| MAT-01 | Choose SOLID_RAW_MAT | Only API and EXCIPIENT selectable |
| MAT-02 | Choose LIQUID_RAW_MAT | Only API, LICENSED FP and EXCIPIENT selectable; OTHER disabled |
| MAT-03 | Choose TABLETS_CAPSULES | LICENSED FP auto-selected and locked |
| MAT-04 | Choose CREAMS_OINTMENTS | Only LICENSED FP and EXCIPIENT selectable |
| MAT-05 | Choose AMPOULES | Only API, LICENSED FP and EXCIPIENT selectable |
| MAT-06 | Choose PACKAGING | Type automatically N/A, non-editable |
| MAT-07 | Attempt invalid combination via API | HTTP 400; database CHECK also rejects direct invalid inserts |
| MAT-08 | Inspect category and UOM lists | No OTHER/NA category in normal form; no KG; AMP and Units available; no PACKAGING type |
| MAT-09 | Inspect system-created Cancelled BMR material | Sole NA category/type/UOM system marker remains intact |
| EXP-01 | Receive expired lot (past expiry date) | Immediately placed in QUARANTINE |
| EXP-02 | Receive near-expiry material matching threshold | Immediately placed in QUARANTINE |
| EXP-03 | Attempt usage of expired or overdue AVAILABLE lot by direct API | HTTP 400; no stock deduction |
| EXP-04 | Record destruction of expired/quarantined lot | Controlled destruction remains possible, subject to permission |
| UI-01 | Select batch size UOM | Only mL, L, g, mg, Tabs, Caps |
| UI-02 | Search consumption lot picker by material code MAT0007 | Matching lot options displayed |

## Automated tests

Run from the repository's `api` directory:

```bash
python -m unittest discover -s tests -v
```

Then build the frontend from the `web` directory:

```bash
npm run build
```

These are **instructions** for validation against the target deployment, not evidence that these commands were executed remotely. Record tester, database/schema version, time, inputs, actual results and screenshots in the validation evidence.
