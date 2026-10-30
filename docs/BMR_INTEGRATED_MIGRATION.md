# StkFlo BMR Master Formula Migration — Feature Guide

## Scope
Three stages in Data Migration → Products & Master Formulas: (1) extract original A–Z Word BMR ZIP and product list; (2) validate and preview product and formula rows; (3) approve and commit.

**Only products represented by extracted BMR Section 4 rows are eligible.** The Product List workbook is a lookup and does not create products or a pending queue for other entries.

## Medisource / Export
Product List Medisource M or Yes maps to EXPORT_LINE; No/N/A maps to N_A. The import derives this from medisource_line, not a legacy Unknown export_line field.

## Stored formula fields
Product formula versions are stored in product_formula_versions. Product ingredient rows are stored in product_formula_lines, with material ID and sequence, original ingredient text, strength, raw master formula, numeric quantity, units, q.s. targets, optional ingredient flag and Section 4 source row/table. Original storage instructions are preserved on the Product record.

No manufacturing scale-up is calculated and no inventory balance is changed by a formula import. Q.s. is a target quantity, not a fixed consumption amount.

## How to use
1. Open Data Migration → Products & Master Formulas.
2. Upload the A–Z BMR ZIP. Add the Product List XLSX/XLSM only if not included in the archive. Select Extract BMRs in StkFlo.
3. Review the extraction table and any source warnings. The extracted CSVs can also be downloaded.
4. Continue to Stage 2 for product/version validation and exact material-name matching against the Material Library (case-insensitive). Missing or ambiguous matches are blocking; new materials are never silently created.
5. Existing products are skipped by default. Enable newer-BMR-version update when required; old formula versions are retained while the current mandatory material set is updated for future consumption verification.
6. Verify a database backup, review source BMR data and enter the QA approval reference and confirmation phrase IMPORT PRODUCT BMRS to commit.

## Standalone fallback
The separate StkFlo BMR Extractor v1.1 produces the identical Products.csv and Master_Formulas.csv input files and a StkFlo_Import_Package.zip. Upload the StkFlo_Import_Package.zip directly in the fallback section, or upload the two CSVs individually. No manual spreadsheet reshaping is needed.

## Permissions
data_migration.view allows viewing and validating imports. data_migration.commit permits approval and commit. ADMIN receives both by default; all other roles start with neither. Assign in Admin → Users & Roles → Roles & Permissions. Existing opening-stock migration is subject to the same rights.

## Safety and audit
- Product BMR imports do not write stock movements or stock balances.
- Import validates again under a PostgreSQL advisory transaction lock.
- Source SHA-256 is stored in a unique migration manifest to block duplicate imports.
- Existing product/material relations still drive consumption verification.
- Source BMR path and original formula quantities/strengths are retained.
- Users must verify actual source records and material matches before import.

## Deployment
The database bootstrap version has been incremented to install db/init/130_product_formula_import.sql. Rebuild the API Docker image with LibreOffice Writer, openpyxl and python-multipart before using in-app legacy DOC conversion. Run a backup and validate in a sandbox before importing the complete ~600-record library.

## Tests
GitHub Actions workflow .github/workflows/bmr-migration-validation.yml compiles the backend, tests synthetic DOCX/XLSX extraction and quantity/export mapping, runs opening-stock regression tests, and builds the frontend with TypeScript.
