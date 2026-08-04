# Administrator Recovery Guide

## Purpose

This guide provides controlled recovery steps for the Eaststone Stock Control Windows deployment. It is intended for authorised system administrators and quality personnel. Recovery actions that affect data, security, certificates or the validated state must be recorded under the organisation’s change control, incident or deviation process as applicable.

## Installation location

The standard executable installation location is:

```text
C:\ProgramData\Eaststone\StockControl
```

The actual path is recorded in:

```text
HKLM\SOFTWARE\Eaststone\StockControl\InstallPath
```

and:

```text
deployment\server-config.ini
```

## Normal recovery sequence

When users report that Stock Control is unavailable:

1. confirm the host computer is powered on and connected to the company network;
2. sign in to the authorised Windows maintenance account;
3. open Docker Desktop and wait until the engine reports that it is running;
4. run `STATUS_WINDOWS.bat`;
5. if the system is not deliberately stopped, run `START_WINDOWS.bat`;
6. verify:

```text
http://127.0.0.1:8088/api/health
https://127.0.0.1:8443/api/health
https://stock-control.test:8443
```

7. review `logs\health-monitor.log` and `logs\health-status.json`;
8. record the incident, actions and outcome.

## Controlled stop

`STOP_WINDOWS.bat` creates:

```text
deployment\manual-stop.flag
```

The automatic health monitor treats this as an authorised stop and does not restart the system. Run `START_WINDOWS.bat` to clear the flag and restart services.

Do not delete the flag manually unless the approved start procedure is unavailable and the action is documented.

## Docker Desktop is not running

### Recovery

1. Start Docker Desktop from the Windows Start menu.
2. Wait for the engine to report that it is running.
3. Run `START_WINDOWS.bat`.
4. Run `STATUS_WINDOWS.bat`.
5. Confirm HTTPS login from a client computer.

The health monitor attempts to start Docker Desktop, but ordinary Windows Desktop installations still depend on an interactive Windows user session. A customer requiring unattended service after reboot should use an approved always-on container-host architecture, such as a supported Linux VM, and validate that deployment separately.

## Containers are stopped or unhealthy

Run:

```bat
docker compose -f infra\docker-compose.production.yml -f infra\docker-compose.production.tls.yml --env-file .env ps -a
```

Review logs:

```bat
docker compose -f infra\docker-compose.production.yml -f infra\docker-compose.production.tls.yml --env-file .env logs --tail=300 db db-init api web
```

Then run:

```text
START_WINDOWS.bat
```

Do not delete containers, images or volumes until the logs have been captured and data-preservation consequences understood.

## Administrator password recovery

Use only after confirming the database schema and API are healthy.

Run:

```text
RESET_ADMIN_PASSWORD_WINDOWS.bat
```

This resets the built-in account to:

```text
Username: admin
Password: Admin123!
```

The script verifies the login endpoint. Immediately log in, change the password, and record:

- reason for reset;
- person authorising the reset;
- person executing the reset;
- date/time;
- confirmation that the password was changed;
- review of relevant security audit events.

## Lost or corrupted `.env`

`.env` contains the active database password and JWT signing secret. Replacing it casually can make the API unable to connect to the existing database or invalidate all active sessions.

### Recovery priority

1. Restore the protected configuration backup from the approved disaster-recovery package.
2. Confirm the restored `DB_NAME`, `DB_USER` and `DB_PASSWORD` match the PostgreSQL container’s existing configuration.
3. Confirm `JWT_SECRET` is the approved current secret.
4. Restart the stack and verify login.

When `.env` cannot be recovered, treat this as a controlled disaster recovery. Database credential recovery and JWT rotation require authorised technical intervention and regression testing.

Never send `.env` in ordinary support emails or tickets.

## Database recovery from backup

Use:

```text
ESC Backup and Restore Tool.exe
```

or:

```text
ESC_BACKUP_RESTORE_WINDOWS.bat
```

The restore tool:

1. verifies the selected backup manifest where available;
2. requires exact destructive confirmation;
3. creates a pre-restore safety backup;
4. stops API and web services;
5. replaces the active database;
6. restarts services;
7. runs a health verification.

After restore, execute the approved post-restore verification checklist, including:

- login;
- material and lot counts;
- recent receipt/consumption records;
- audit trail availability;
- user/role configuration;
- analytics access;
- creation of a new post-restore backup;
- QA approval before operational use.

## Backup is unavailable or corrupt

1. Preserve the original backup file and manifest.
2. Do not overwrite it or repeatedly modify it.
3. Review SHA-256 manifest and `logs\backup-restore-tool.log`.
4. Locate the next most recent verified backup.
5. Assess the potential data-loss interval.
6. Raise a deviation/incident before restoring an older dataset.
7. Reconcile paper/source records for the missing interval after restore.

## Certificate renewal failure

Review:

```text
logs\certificate-renewal.log
```

Confirm these files exist and remain protected:

```text
infra\certs\stock-control-ca.crt
infra\certs\stock-control-ca.key
```

Run the renewal check manually from an elevated PowerShell window:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\Certificate-Renewal.ps1 -InstallRoot "C:\ProgramData\Eaststone\StockControl"
```

Do not create a new CA merely because renewal failed. Normal renewal must reuse the existing CA so client computers continue trusting the service.

## Private CA key is lost

The private CA key is required to issue future server certificates trusted by existing clients. Its loss does not immediately invalidate the current certificate, but automatic renewal cannot continue.

Required recovery:

1. raise a security/continuity incident;
2. preserve the current working certificate and configuration;
3. create a new controlled CA;
4. distribute the new public CA to all clients before switching the server certificate;
5. generate and deploy a new server certificate;
6. update the client deployment package;
7. verify every client group;
8. document and approve the CA rollover.

A database backup alone does not contain the CA private key.

## Server computer replacement

A complete migration requires:

```text
approved release package
verified PostgreSQL backup and manifest
.env
infra\certs\stock-control-ca.crt
infra\certs\stock-control-ca.key
infra\certs\stock-control.crt
infra\certs\stock-control.key
deployment\server-config.ini
validation and configuration records
```

High-level process:

1. create and verify a final backup on the old host;
2. place the old system in controlled stop/maintenance;
3. install the same approved release on the replacement host;
4. restore protected configuration and certificate material;
5. restore the database;
6. retain the same hostname and, preferably, the same IP or update DNS/client configuration;
7. execute IQ/OQ regression checks;
8. obtain QA approval;
9. decommission the old host under controlled procedure.

## Server IP address changes

A certificate generated with the hostname remains valid when users connect by the hostname, but clients must resolve that hostname to the new IP.

Preferred action:

- update internal DNS centrally.

Hosts-file deployment:

- rebuild or update `client-config.ini`;
- rerun client setup or the hosts helper on each client;
- verify network/firewall routes;
- update server configuration records;
- consider renewing the server certificate so its IP SAN reflects the new IP;
- update IQ evidence.

## Complete uninstall

Use:

```text
ESC Uninstall.exe
```

or:

```text
UNINSTALL_WINDOWS.bat
```

The uninstaller permanently removes the PostgreSQL volume and all Stock Control data after two exact confirmations. Before uninstalling a live or validated system:

1. create and independently verify the final backup;
2. export required audit/operational records;
3. obtain documented authorisation;
4. retain the approved release and recovery materials according to retention policy;
5. confirm the decommissioning plan and responsibilities.

## Recovery evidence package

For any significant recovery, retain:

- incident/deviation/change-control reference;
- `STATUS_WINDOWS.bat` output;
- relevant application/container logs;
- selected backup filename and SHA-256;
- before/after health status;
- user acceptance results;
- IQ/OQ regression evidence;
- executor/reviewer names and dates;
- QA disposition.

## Escalation boundary

Stop and escalate when:

- database integrity is uncertain;
- audit records appear missing or altered;
- private keys may be compromised;
- a restore fails part-way;
- the wrong database may have been restored;
- production records could be lost;
- an unapproved release may be running;
- antivirus/security tooling has quarantined application files;
- repeated container or certificate failures recur without understood root cause.
