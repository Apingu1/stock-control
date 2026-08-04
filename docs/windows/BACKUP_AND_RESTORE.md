# Backup and Restore Operating Guide

## Scope

This guide covers the Windows deployment backup and restore controls supplied with Eaststone Stock Control. It should be incorporated into the customer’s approved business-continuity, disaster-recovery and GMP computerised-system procedures.

## Backup contents

The automatic database backup contains the active PostgreSQL database in custom `pg_dump` format. Each backup is accompanied by a JSON manifest containing:

- creation date/time;
- database name;
- host computer;
- Windows user;
- reason;
- file size;
- SHA-256 hash.

Default folder:

```text
C:\ProgramData\Eaststone\StockControl\backups-production-test
```

The database backup does not include:

- `.env`;
- private CA/server keys;
- approved installer/release package;
- host configuration;
- external validation documents.

Those items require a protected configuration/disaster-recovery backup.

## Scheduled backups

The server setup registers:

```text
Eaststone Stock Control - Daily Backup
```

Default execution time:

```text
02:30 every day
```

The task runs:

```text
windows\Automatic-Backup.ps1
```

Default local retention is 30 days. Customer retention and off-host copying must be defined according to risk assessment and record-retention requirements.

## Manual backup

Run:

```text
ESC Backup and Restore Tool.exe
```

Select:

```text
1. Create verified backup now
```

Alternatively, run:

```text
ESC_BACKUP_RESTORE_WINDOWS.bat
```

The backup is successful only when:

- a `.dump` file exists;
- its `.dump.json` manifest exists;
- the log reports completion;
- the file is non-zero size;
- the SHA-256 can be independently recalculated and matched.

## Off-host backup

A local Docker host failure can destroy the application and local backups together. Copy verified backups to an approved protected off-host location, such as a controlled server share or backup platform.

Recommended structure:

```text
N:\Quality\QA\ESC -Stock Control\Backups\
  Production\
    YYYY\
      MM\
```

Off-host copying should preserve both:

```text
stock-control-YYYYMMDD_HHMMSS.dump
stock-control-YYYYMMDD_HHMMSS.dump.json
```

Access should be restricted and backup immutability/versioning used where available.

## Backup review

At an approved frequency, review:

- Task Scheduler last result;
- `logs\backup.log`;
- `logs\health-status.json` backup age;
- local and off-host backup counts;
- file sizes and unexpected changes;
- SHA-256 manifest presence;
- free disk capacity;
- exceptions/deviations.

## Restore prerequisites

Before restoring:

1. confirm authorised change/deviation/incident reference;
2. identify the correct target system and database;
3. confirm users are logged out;
4. record the current dataset/time;
5. select and verify the intended backup and manifest;
6. assess the data-loss interval;
7. ensure Docker/PostgreSQL are healthy;
8. ensure adequate disk space;
9. confirm the post-restore verification plan;
10. obtain required approval.

## Controlled restore

Run:

```text
ESC Backup and Restore Tool.exe
```

Select:

```text
3. Restore a backup
```

The tool:

1. opens a controlled backup selector;
2. verifies SHA-256 when a manifest exists;
3. requires the exact phrase `RESTORE STOCK CONTROL`;
4. creates a pre-restore safety backup;
5. stops API and web containers;
6. copies the selected backup into PostgreSQL;
7. replaces the active database;
8. runs `pg_restore`;
9. restarts the application;
10. executes the health monitor.

Do not interrupt the host or Docker during restore.

## Post-restore verification

Verify and record:

1. HTTP and HTTPS health;
2. administrator login;
3. expected database date/data cut;
4. user and role configuration;
5. material and product counts;
6. representative material master record;
7. representative receipt;
8. representative consumption and customer name;
9. live lot balance;
10. quarantine status;
11. audit trail access and representative history;
12. analytics batch/product drilldown;
13. automatic material-code sequence progression;
14. ADMIN access to all permissions;
15. creation of a new post-restore backup;
16. QA review and approval before returning to use.

## Restore challenge / periodic verification

A backup is not proven until restored successfully. At a risk-based frequency, restore a selected production backup into a segregated test dataset/host and document:

- backup selection and SHA-256;
- restore execution;
- integrity checks;
- record counts;
- functional checks;
- audit trail checks;
- discrepancies;
- approval.

Never perform a restore challenge over the active production database.

## Recovery point and recovery time

The customer must approve:

- Recovery Point Objective (maximum acceptable data-loss interval);
- Recovery Time Objective (maximum acceptable outage);
- daily backup timing;
- off-host copy frequency;
- retention;
- responsible roles;
- escalation contacts.

Daily local backup alone may not meet the required recovery point.

## Configuration and certificate recovery package

Protect separately:

```text
.env
infra\certs\stock-control-ca.crt
infra\certs\stock-control-ca.key
infra\certs\stock-control.crt
infra\certs\stock-control.key
deployment\server-config.ini
approved release package
approved validation/configuration records
```

Private keys must be encrypted or otherwise protected and access-controlled. Do not store them in an unrestricted shared folder.

## Failed restore

When restore fails:

1. stop further write activity;
2. preserve selected and pre-restore backups;
3. preserve logs;
4. do not delete the PostgreSQL volume;
5. document the error and stage reached;
6. escalate to authorised technical support/QA;
7. determine whether the pre-restore backup must be restored;
8. execute full post-recovery verification.

Relevant logs:

```text
logs\backup-restore-tool.log
logs\backup.log
Docker db/api/web logs
```

## Prohibited routine commands

Do not use during normal operation:

```text
docker compose down -v
docker volume rm stock-control-prodtest-db-data
UNINSTALL_WINDOWS.bat
```

These can destroy the active database.
