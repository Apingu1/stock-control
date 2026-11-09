# StkFlo — Generic flavouring in BMRs and consumption

Scope: flavouring only. No changes to packaging receipts, packaging lots or packaging consumption.

## Classification and stock

- Create real flavour materials using `category_code=FLAVOURING` and `type_code=NA`.
- UOM remains a valid stock UOM (normally ML, or as appropriate).
- Flavour goods receipts **must specify a physical lot number and expiry date**.
- The FLAVOURING/NA auto-quarantine default is one day before the printed expiry date.
- Flavour consumption cannot issue stock within its expiry/quarantine threshold even when the global quarantine issue toggle permits other quarantined stock. Destruction issues remain available.
- An operator must select the exact physical lot (no FEFO auto-selection). Name search shows each available lot separately.

## Generic CSV markers (Master_Formulas.csv)

The import recognises two exact values in the `material_name` column:

| material_name | conditional_material | Requirement |
| --- | --- | --- |
| FLAVOUR_OPTIONAL | Yes | 0 or 1 distinct flavour material; optional |
| FLAVOUR_REQUIRED | No | 1 distinct flavour material; mandatory |

A physical flavour can be consumed from multiple explicit lots of that SAME material.
More than one distinct flavour material fails ordinary compliant-batch validation.
Specific named flavours remain fixed formula materials and must have an exact
material name match in the Materials Library, as before.

The importer refuses marker/conditional flag contradictions. It does not guess
whether existing source text such as `____ Flavour` means mandatory or optional.
Preserve source records and obtain the requisite source-BMR review before migration.
Only the two identifiers above bypass exact material-name lookup.

## Product list and consumption

- Product editor supports No generic flavour / Optional / Mandatory in the
  current version's Master Formula. There is no fake stock material for markers.
- The generic slot is stored as a versioned product formula line with a null
  material ID and an explicit ingredient code. Physical stock stays in Materials.
- Fixed optional ingredients are permitted but not required in consumption.
- With a generic slot, the consumption screen offers a dedicated flavour section
  with material-name lookup and separate entries for physical lots.
- Optional flavour can be skipped. Mandatory flavour cannot be skipped during
  normal compliant consumption. Existing rejected-batch authorisation logic
  remains authoritative in the backend.
- Lot identity, balance, status, valuation and audit remain the existing ledger.

## Database changes (additive)

`db/init/131_flavouring_formula_slots.sql`

- Seeds FLAVOURING category and FLAVOURING/NA one-day expiry threshold.
- Extends existing category/type check (does not reclassify old records).
- Allows nullable `product_formula_lines.material_id` for generic slots and
  adds `ingredient_code` with a checked, one-slot-per-formula constraint.
- Does not alter packaging stock or any stock transactions.

New production bootstraps apply SQL 131 in normal numbered order. Production
v7 bootstraps use the v7->v8 additive upgrade; v6 receives SQL 130 and 131.
Do not rerun the full historical bootstrap against live stock.

For an **existing Codespaces active database**, with the existing DB/API stack
running and after pulling this branch, run:

```bash
bash scripts/apply_flavouring_schema.sh dev
```

The script detects the active StkFlo database and takes a verified PostgreSQL
backup before applying migration 131. The new API expects this migration.
The Windows deployment is not updated by merely pushing GitHub commits.

## Verification checklist

1. Add Flavouring material with NA type and correct UOM; receipt requires
   physical lot number and expiry date.
2. Receive two lots of Strawberry Flavour and confirm name search lists each,
   with the correct expiry and available quantity.
3. Optional flavour omitted: ordinary batch compliant if all other requirements
   are met. Optional included: exactly selected lot deducted.
4. Mandatory flavour absent: batch cannot complete as compliant. One chosen:
   compliant if all other requirements are met.
5. Two different flavour materials under one generic slot: non-compliance flagged.
6. An unconfigured flavour without a generic slot: unexpected material flagged.
7. Flavour inside the one-day expiry window: issue blocked even if global
   quarantine issue permission is enabled.
8. Existing packaging receipt and lot-based packaging consumption unchanged.

Run local checks:

```bash
cd api
python -m unittest discover -s tests -p 'test_flavouring_formula_slots.py' -v
python -m unittest discover -s tests -p 'test_stkflo_stock_integrity.py' -v
python -m unittest discover -s tests -p 'test_consumption_packaging.py' -v
cd ../web
npm ci && npm run build
```

A branch-scoped GitHub Actions workflow also defines these checks.
