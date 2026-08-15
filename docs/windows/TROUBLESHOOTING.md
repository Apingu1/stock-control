# Windows Troubleshooting Guide

## First-response sequence

1. Confirm the host computer is powered on and connected to the company network.
2. Open Docker Desktop and confirm the engine is running.
3. Run `STATUS_WINDOWS.bat`.
4. Run `START_WINDOWS.bat` when the system is not deliberately stopped.
5. Review:

```text
logs\health-status.json
logs\health-monitor.log
logs\certificate-renewal.log
logs\backup.log
```

6. Check the Docker containers:

```bat
docker compose -f infra\docker-compose.production.yml --env-file .env ps
```

7. Check recent logs:

```bat
docker compose -f infra\docker-compose.production.yml --env-file .env logs --tail=200 db db-init api web
```

## Server is down after a restart

### Symptoms

- clients report “site cannot be reached”;
- Docker Desktop is closed or starting;
- `STATUS_WINDOWS.bat` reports Docker not running.

### Recovery

1. Sign in to the Stock Control host using the maintenance account.
2. Start Docker Desktop.
3. Wait until Docker reports the engine is running.
4. Run `START_WINDOWS.bat`.
5. Confirm `https://stock-control.test:8443/api/health` returns `ok=true`.

The automatic health task runs at logon and every 30 minutes. Docker Desktop still requires an interactive user context on ordinary Windows Desktop installations. For unattended production hosting, use an approved always-on container-host architecture.

## Controlled stop remains active

`STOP_WINDOWS.bat` creates:

```text
deployment\manual-stop.flag
```

The health monitor will not restart the system while this file exists. Run:

```text
START_WINDOWS.bat
```

This clears the flag and performs recovery.

Do not manually delete the flag unless the start script itself is unavailable.

## HTTP works but HTTPS does not

Test:

```text
http://localhost:8088/api/health
https://localhost:8443/api/health
```

Then check:

```bat
docker compose -f infra\docker-compose.production.yml -f infra\docker-compose.production.tls.yml --env-file .env ps
docker compose -f infra\docker-compose.production.yml -f infra\docker-compose.production.tls.yml --env-file .env logs --tail=200 web
```

Confirm these files exist:

```text
infra\certs\stock-control.crt
infra\certs\stock-control.key
infra\certs\stock-control-ca.crt
infra\certs\stock-control-ca.key
```

Run `ENABLE_HTTPS_WINDOWS.bat` using the recorded hostname/IP, or rerun the recommended server setup. Routine HTTPS setup reuses the existing CA.

## `stock-control.test` cannot be reached

On the affected computer:

```bat
ping stock-control.test
ipconfig /flushdns
```

The hostname must resolve to:

- `127.0.0.1` on the host itself when using the local hosts entry;
- the host’s company-network IP on client computers.

Review:

```text
C:\Windows\System32\drivers\etc\hosts
```

or confirm the internal DNS record with IT.

## Browser certificate warning

1. Confirm the URL is exactly `https://stock-control.test:8443`.
2. Confirm the current `stock-control-ca.crt` is installed under:

```text
Local Computer\Trusted Root Certification Authorities\Certificates
```

3. Close every browser window and reopen it.
4. Confirm the computer date/time is correct.
5. Confirm the server certificate was generated for the same hostname.
6. Confirm the CA was not deliberately replaced after the client imported it.

Normal automatic server-certificate renewal does not replace the CA.

## Login returns HTTP 500

Collect API/database logs:

```bat
docker compose -f infra\docker-compose.production.yml --env-file .env logs --tail=250 api db db-init
```

On a new installation, ensure the database initialiser completed successfully. Do not simply reset the password until the schema error is understood.

For bootstrap access after schema health is confirmed, run:

```text
RESET_ADMIN_PASSWORD_WINDOWS.bat
```

Default recovery password:

```text
Admin123!
```

At the next login, complete the mandatory private-password prompt before continuing.

## Database initialiser failed

Check:

```bat
docker compose -f infra\docker-compose.production.yml --env-file .env ps -a
docker compose -f infra\docker-compose.production.yml --env-file .env logs --tail=300 db-init db
```

The API waits for `db-init` to complete. A failed migration should be corrected rather than bypassed. Preserve the database volume and collect the exact SQL error.

Do not run `UNINSTALL_WINDOWS.bat` or `docker compose down -v` when production data must be preserved.

## Material code does not populate

The create modal requests:

```text
/api/materials/next-code
```

Check the browser Network tab and API logs. Confirm migration `124_customer_material_sequence_admin_permissions.sql` was applied and `material_code_seq` exists.

Database diagnostic:

```bat
docker compose -f infra\docker-compose.production.yml --env-file .env exec -T db psql -U stock -d stock -c "SELECT last_value, is_called FROM material_code_seq;"
```

Use the actual DB user/name from `.env` when changed.

## Customer name is not shown

Confirm the API has rebuilt from the new release and migration 124 applied. Check:

```bat
docker compose -f infra\docker-compose.production.yml --env-file .env exec -T db psql -U stock -d stock -c "SELECT customer_name FROM consumption_batches ORDER BY id DESC LIMIT 10;"
```

A browser may still serve an older cached PWA shell. Close all app windows, reopen the HTTPS site, and apply any “Update available” prompt. In a controlled deployment, document the release/update verification.

## ADMIN is missing permissions

1. Sign out and sign in again so the frontend reloads `/auth/my-permissions`.
2. Confirm the role is exactly `ADMIN`.
3. Confirm migration 124 has run.
4. Check:

```sql
SELECT p.key, rp.granted
FROM permissions p
LEFT JOIN role_permissions rp
  ON rp.permission_key=p.key AND rp.role_name='ADMIN'
ORDER BY p.key;
```

The backend also resolves ADMIN dynamically to every permission in the permission catalogue.

## Docker build is very slow

Common causes:

- application extracted to a mapped network drive;
- antivirus scanning the build context;
- Docker downloading base images for the first time;
- insufficient disk/RAM;
- stale Docker build cache.

Keep the installed application on local host storage. Use the shared drive only for approved packages, copied backups and validation records.

## Port 8088 or 8443 is already in use

Check:

```bat
netstat -ano | findstr :8088
netstat -ano | findstr :8443
```

Identify the process before changing application ports. If ports are changed in `.env`, update server/client configuration, firewall rules, shortcuts, certificates where relevant, IQ evidence and controlled documentation.

## Client cannot connect but server works locally

1. Test `https://SERVER-IP:8443/api/health` from the client using `curl -k`.
2. Confirm TCP 8443 is allowed by host firewall and network firewall.
3. Confirm client and host are on routable networks/VLANs.
4. Confirm the hostname resolves to the host IP.
5. Confirm the CA is trusted on that client.

## Automatic backup failed

Review:

```text
logs\backup.log
```

Also review `runtime-state\backup_scheduler_status.json`, then confirm:

- Docker and the `backup-scheduler` container are running at the configured time;
- PostgreSQL container is healthy;
- the folder selected in **ESC Backup Settings** is accessible to Windows and Docker;
- host disk has sufficient space;
- antivirus did not quarantine the dump;
- the scheduler status shows a recent successful result.

Run a manual backup through the Admin screen or `Administration & Recovery\02 - BACKUP AND RESTORE.bat` and investigate before assuming backups are available.

## Restore failed

Do not repeatedly retry without reviewing:

```text
logs\backup-restore-tool.log
logs\backup.log
```

The restore tool creates a pre-restore safety backup and leaves the original active database untouched until a new recovery database has passed validation. Preserve the selected and pre-restore backups and escalate with the exact `pg_restore` error.

## Certificate renewal task failed

Review:

```text
logs\certificate-renewal.log
```

Confirm Docker is running and both CA files exist. The renewal task must have access to:

```text
infra\certs\stock-control-ca.crt
infra\certs\stock-control-ca.key
```

Do not create a new CA merely because server renewal failed. Repair the task or file access first.

## Complete diagnostic bundle

For support, collect copies of:

```text
logs\
deployment\server-config.ini
deployment-records\ESC-IQ-Execution-Latest.html
docker compose ps output
docker compose logs for db-init, api and web
Windows version
Docker Desktop version
browser version
exact URL and error text
```

Do not include `.env`, CA private key or server private key in ordinary support bundles.
