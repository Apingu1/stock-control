# Backup and Restore Operating Guide

## Scope

This guide covers the automatic, manual and restore controls supplied with Eaststone Stock Control. Incorporate it into the customer’s approved business-continuity, disaster-recovery and GMP computerised-system procedures.

## How storage works

Backups are PostgreSQL custom-format `.dump` files. The selected Windows folder is bind-mounted into the API and backup-scheduler containers at `/backups`; the files therefore live on the Windows host or approved network share, not in a disposable Docker container layer.

The initial default is:

```text
C:\ProgramData\Eaststone\StockControl\Backups
```

To change it on the server, open either:

```text
ESC Backup Settings
Administration & Recovery\01 - BACKUP SETTINGS.bat
```

The utility provides a real folder browser and accepts a local fixed drive or an approved UNC/network location accessible to Docker Desktop. It performs a Windows write test, reconnects the API and scheduler to the folder, and performs a container write test before accepting a changed location. If validation fails, the previous configuration is restored.

Existing backups are not moved or deleted when the folder changes. Move or copy them separately if they must remain visible in the application.

The web application shows the configured physical location. A normal browser cannot safely browse the server’s filesystem, so changing the server folder is deliberately performed by the Windows server utility.

Runtime state is stored separately under:

```text
C:\ProgramData\Eaststone\StockControl\runtime-state
```

Changing the backup folder therefore does not reset the active dataset, maintenance mode, schedule or audit trail.

## Backup files and manifests

Simple filenames identify the purpose and creation time:

```text
StockControl_Auto_2026-08-13_02-30-00.dump
StockControl_Manual_2026-08-13_14-05-12.dump
StockControl_PreRestore_2026-08-13_14-12-44.dump
StockControl_Initial_2026-08-13_09-00-00.dump
StockControl_Imported_2026-08-13_14-10-01.dump
```

The internal PostgreSQL database name is recorded in the adjacent manifest and is no longer required in the user-facing filename. Each backup created by Stock Control has a `.dump.json` manifest containing its type, creation time, reason, creator, active database, file size and SHA-256 hash.

Backups do not include `.env`, private certificates/keys, the approved release package, host configuration or validation documents. Protect those separately as controlled configuration and recovery records.

## Automatic daily backups

The `backup-scheduler` Docker service runs continuously and does not depend on a Windows user being logged in. The initial setting is enabled at `02:30 Europe/London` with 30-day automatic-backup retention.

An administrator can change the enabled state, daily time or retention later from either:

- Admin → Database Backup & Recovery in the web application; or
- `ESC Backup Settings` on the Windows server.

The new setting is persisted immediately; no reinstall or new Windows scheduled task is required. A missed scheduled time is run when the always-on scheduler next checks that day. Only expired `AUTO` backups are removed automatically. Manual, initial, imported and pre-restore safety backups are never removed by automatic retention.

Review the next run, last result and last successful automatic backup in the Admin screen or `04 - SERVER STATUS.bat`.

## Manual backups

In the web application, open Admin → Database Backup & Recovery and select **Back Up Now**. An optional note can be supplied; no typed confirmation phrase or database-name entry is required.

On the Windows server, run:

```text
Administration & Recovery\02 - BACKUP AND RESTORE.bat
```

and select **Create verified backup now**.

Both entry points use the same backup engine, active-dataset selection, lock, filename convention and SHA-256 manifest.

A backup is successful only when the `.dump` and `.dump.json` files exist, the dump is non-empty/custom-format, and completion is recorded without error.

## Restore from the web application

The normal restore path is Admin → Database Backup & Recovery:

1. use the file browser to choose any accessible `.dump` file, or select **Use for restore** beside a stored backup;
2. enter the required audit/change/deviation/incident reason;
3. select **Restore and Activate**;
4. accept the single confirmation dialog.

When a physical file is selected, it is streamed into the configured backup folder and registered as an imported backup. The service then:

1. validates PostgreSQL custom format and SHA-256 when a manifest is available;
2. prevents another backup/restore from overlapping;
3. creates a verified pre-restore safety backup of the current active dataset;
4. creates an internally named `stock_restore_*` recovery database;
5. restores without overwriting the current database;
6. applies the current controlled schema bootstrap to older compatible backups;
7. verifies required Stock Control tables and representative record counts;
8. activates the restored database only after validation;
9. retains the prior database for rollback; and
10. returns maintenance mode to its previous state.

If restore or validation fails, the incomplete recovery database is removed and the original active database remains selected.

Large uploads are allowed up to the configured server limit (5 GB by default). Keep the browser and server running until completion.

## Windows guided recovery

`02 - BACKUP AND RESTORE.bat` also provides a native Open File dialog for server-side recovery. It uses one Yes/No confirmation, normally creates a pre-restore backup, restores into a new recovery database, validates required tables, activates only after validation, retains the previous database and runs the health monitor. This path is useful when normal browser access is unavailable but Docker and PostgreSQL are operational. If the API is too unhealthy to create the additional safety dump, the utility records and displays that exception but can still proceed safely because it never overwrites the current database.

## Post-restore verification

Verify and record:

1. HTTP and HTTPS health and administrator login;
2. expected data date/cut and representative record counts;
3. users, roles and permissions;
4. representative material, lot, receipt and consumption records;
5. live balances, quarantine status, audit trail and analytics;
6. automatic material-code sequence progression;
7. the pre-restore safety backup and retained rollback dataset; and
8. QA approval before returning the system to routine use.

Create a new manual backup after the restored system is approved.

## Off-host protection

Selecting an approved network share as the configured destination can place new backups directly off the application drive, provided the Docker Desktop service account has durable access. Alternatively, copy both `.dump` and `.dump.json` files to an approved protected platform. Use restricted access and immutability/versioning where available.

Daily backup alone may not meet the approved Recovery Point Objective. Define and approve the backup time, retention, off-host copy/replication, restore-test frequency, responsible roles, escalation contacts, RPO and RTO.

## Restore challenge

A backup is not proven until restored successfully. At a risk-based frequency, restore a selected production backup into a controlled recovery/test context and document the selected file/hash, execution, integrity checks, record counts, functional checks, audit checks, discrepancies and approval. Do not intentionally overwrite the active production database for a routine challenge.

## Relevant records

```text
runtime-state\backup_settings.json
runtime-state\backup_scheduler_status.json
runtime-state\db_tools_audit.jsonl
logs\backup.log
logs\backup-restore-tool.log
logs\backup-settings.log
logs\health-status.json
Docker db/api/backup-scheduler/web logs
```

Do not use `docker compose down -v`, `docker volume rm stock-control-prodtest-db-data` or complete uninstall during normal operation; these can destroy the active database volume.
