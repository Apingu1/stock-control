BEGIN;

-- New permissions for controlled editing of stock history
INSERT INTO permissions (key, description)
VALUES
    ('receipts.edit', 'Edit posted receipts (audit reason required)'),
    ('issues.edit',   'Edit posted consumption/issues (audit reason required)')
ON CONFLICT (key) DO NOTHING;

-- Ensure every role has these permissions (default = FALSE)
INSERT INTO role_permissions (role_name, permission_key, granted)
SELECT r.name, p.key, FALSE
FROM roles r
CROSS JOIN (
    SELECT 'receipts.edit' AS key
    UNION ALL
    SELECT 'issues.edit'
) p
WHERE NOT EXISTS (
    SELECT 1
    FROM role_permissions rp
    WHERE rp.role_name = r.name
      AND rp.permission_key = p.key
);

COMMIT;
