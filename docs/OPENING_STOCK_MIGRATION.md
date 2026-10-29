# StkFlo — Opening Stock Migration (Windows VM + Codespaces)

## Scope

**Only live opening stock is posted.** No source historical purchases, usage,
wastage or manufacturing consumption are imported. Opening stock becomes a
clearly identified StkFlo goods receipt per verified physical supplier lot /
disposition segment, with the remaining **quantity** and **GBP value**.

The same browser-based Admin → Settings → Opening Stock Migration panel is
available in both developer Codespaces and a Windows-hosted production VM. The
CSV is uploaded from the operator's browser; it does **not** need to be placed
inside a container or a shared Windows folder. No workbook password is needed.

## Deploy / open

Codespaces:

\`\`\`bash
cd /workspaces/stock-control
git fetch origin feature/stkflo-opening-stock-migration
git switch --track origin/feature/stkflo-opening-stock-migration
docker compose -f infra/docker-compose.yml up -d --build
\`\`\`

Sign in with a user who has \`admin.full\`, then navigate to
**Admin → Settings → Opening Stock Migration**.

Windows VM: install or update StkFlo from a build that includes this branch,
using the application's normal Windows/VM deployment procedure. If the VM
installation is Docker Compose based, rebuild the API and web image from the
updated source (\`docker compose -f infra/docker-compose.production.yml up -d --build\`,
executed from the deployment directory with the production \`.env\`).
The importer is part of StkFlo, not a separate Windows executable.
Installing the migration feature does not import any stock.

**Important:** Do not point a Codespaces development deployment at the
Windows production database.

## 1. Prepare the migration CSV

Select **Download CSV template** to see the required 21 columns. The prepared
legacy worklist supplied with this project contains one MATERIAL row per
legacy material, and one LOT row per identified material/supplier batch. All
candidate lots are initially marked \`include_opening=NO\`.

- MATERIAL: \`material_code\`, \`material_name\`, \`category_code\`,
  \`type_code\`, \`uom_code\`, \`material_status\`, optional master supplier
  and manufacturer. Existing codes are matched and **not overwritten**.
- LOT: \`material_code\`, \`lot_number\`, \`lot_status\`,
  \`expiry_date\`, optional verified manufacturer/supplier.
- Set \`include_opening=YES\` **only** on confirmed, physically held batches.
  Each selected line needs a positive \`confirmed_qty\` in the material base UOM.
- Enter \`original_unit_cost_gbp\` as a verified original purchase-unit cost
  **or** \`current_stock_value_gbp\` as a documented current remaining value.
  If both are supplied they must agree within £0.01.
- Add \`cost_source_reference\` (invoice or approved valuation),
  \`qa_verification_reference\`, and \`qa_verified_by\` to each selected lot.

Remaining value (not historical invoice total):
\`current_stock_value = confirmed_cutover_qty × verified original unit cost\`.
If original unit cost cannot be verified, a QA-approved valuation must be
supported by a valuation reference. **Do not use the legacy master-list pack
price as an assumed historical invoice price.**

Preserve lot numbers as **text** when opening CSVs in Excel; use Data →
From Text/CSV and explicitly set lot-number columns to Text to avoid
leading-zero loss or date conversion. Save the completed worklist as UTF-8 CSV.
Do not upload the password-protected original workbook to this importer.

### Exclusions and blockers

- Lots with NO/blank \`include_opening\` are not posted.
- Any selected lot with missing quantity, verified cost, cost reference, lot
  number or QA details blocks the *entire* import.
- Negative/zero selected quantities and inconsistent price×quantity/value
  block import.
- Duplicate selected lot/status lines block import.
- Existing StkFlo physical lots with the same material code and lot number
  block import, even if the existing quantity is zero.
- Invalid categories, types and UOM mappings block import.
- Expired or auto-quarantine-window stock cannot be imported AVAILABLE.
  Set such stock to QUARANTINE after QA review.
- Material names/classifications must match existing StkFlo material codes.
  Existing materials are not silently edited.
- MATERIAL rows can be included for zero-stock materials; they do not
  generate zero-quantity receipts.

Use the older preflight exception file and the physical stocktake to
reconcile selected quantities to the frozen legacy workbook. The old workbook
contains overlapping baseline, stocktake and transaction calculations; the
preflight current-quantity estimate is **not** an authoritative lot balance.

## 2. Test in Codespaces — no live posting

1. Open the admin migration panel.
2. Upload \`StkFlo_Opening_Stock_Preview_Example_DO_NOT_COMMIT.csv\`.
3. Click **Validate & preview**.
4. On an otherwise empty Codespaces DB, expect 1 new material, 1 opening lot,
   and a £70.00 opening value (350 g × £0.20/g).
5. **Do not click Commit** for the demo. The example references are fictitious.
6. Upload the legacy worklist without any YES rows; validation should
   correctly block posting. Then resolve the worklist using verified records.

API unit tests (after the app environment is available):

\`\`\`bash
docker compose -f infra/docker-compose.yml exec api \
  python -m unittest discover -s tests -p 'test_opening_stock_migration.py'
\`\`\`

## 3. Controlled production cutover (Windows VM)

1. Freeze legacy stock movements at an agreed time, perform a physical
   supplier-batch stocktake, and export the legacy stock ledger for archiving.
2. Obtain QA verification and a signed reconciliation for every imported lot,
   price/valuation and disposition. Confirm supplier batches and expiry dates.
3. Create and verify a restorable PostgreSQL backup of the **active** StkFlo
   dataset. The two on-screen backup/verification checkboxes are attestations;
   they do not perform an automatic backup or provide e-signatures.
4. Upload the final CSV and inspect the read-only preview. Resolve every
   blocking finding. Check total materials/lots/value and the file SHA-256.
5. Fill the formal approval reference, name and cutover date; check the backup
   and reconciliation declarations; type \`IMPORT OPENING STOCK\`; then commit.
6. Read the success result and migration history; reconcile Live Lots,
   Goods Receipts and reporting totals against the signed cutover report.
7. File the CSV, source workbook, QA review, backup manifest and migration ID
   under your local GMP document-retention process.

## Database and audit behavior

- On commit, StkFlo creates two new audit tables automatically if missing:
  \`opening_stock_migrations\` and \`opening_stock_migration_lines\`.
  The existing Windows VM and Codespaces DB bootstraps do not need manual
  modification. These tables record SHA-256, approving person/reference,
  operator, cutover date, totals, cost and verification references, and actual
  stock transaction IDs.
- Each opening record is a normal \`stock_transactions\` RECEIPT,
  with \`target_ref=MIGRATION:<id>\` and a cutover comment. The StkFlo record
  creation date is the **real import date**, not a fictional supplier receipt.
- No original invoice amount is posted after consumption; **only remaining
  stock value** is posted.
- One transaction covers all materials and lots; a failure rolls back the
  import as a whole. Repeated identical CSVs are refused by SHA-256, and
  existing physical lots are refused to prevent double counting.
- Backend enforcement uses \`admin.full\` even if someone bypasses the UI.
- The importer does not create a regulated electronic signature; a separate,
  approved QA record remains required for GMP sign-off.

## Important limitations

This release deliberately supports **UTF-8 CSV**, not direct encrypted XLSX
ingestion. It cannot reconstruct verified per-batch balances or original
invoice prices from unreliable legacy summaries. The deployment must be
tested against a non-production dataset and validated before regulated use.
A stock migration cannot be trivially reversed by deleting receipts: if a
wrong live cutover is committed, restore the verified backup under a
controlled recovery/change process.
