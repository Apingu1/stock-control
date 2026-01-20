-- 115_material_types_aliases.sql
-- Compatibility aliases for UI/legacy codes.

INSERT INTO material_types (code, name)
VALUES ('LICENSED FP', 'Licensed FP')
ON CONFLICT (code) DO NOTHING;
