# Eaststone Stock Control — Windows Deployment Overview

## Release components

A built Windows release contains a clean BAT-based commercial package:

- `01 - INSTALL SERVER.bat` — elevated, recommended central-server installation;
- `02 - START SERVER.bat`, `03 - STOP SERVER.bat`, `04 - SERVER STATUS.bat` — routine controls;
- `CLIENT DEPLOYMENT` — pre-supplied BAT-based client installation/removal, finalised with the server address and public CA during installation;
- `Administration & Recovery\01 - BACKUP SETTINGS.bat` — backup folder browser and adjustable daily schedule;
- `Administration & Recovery\02 - BACKUP AND RESTORE.bat` — manual backup and guided restore;
- `Administration & Recovery\03 - COMPLETE UNINSTALL.bat` — destructive server uninstall; and
- automatic certificate renewal/health Windows tasks plus an always-on Docker backup scheduler.
- Installation Qualification execution report and recovery documentation.

The supported commercial package deliberately does not build or distribute unsigned self-extracting installer executables. Docker Desktop/Docker Engine is required on the Stock Control host.

## Recommended architecture

One always-on computer is the **Stock Control host**. PostgreSQL, FastAPI and the compiled web application run there as Docker containers. Operator computers are clients and connect to that one central host.

```text
Stock Control host
  Docker Desktop / Docker Engine
  PostgreSQL volume
  FastAPI container
  Backup scheduler container
  Nginx + compiled React/PWA container
  HTTPS certificate and private keys
  Automatic maintenance tasks

Client computers
  Public Stock Control CA only
  Hostname mapping or company DNS
  Desktop/Start-menu app shortcut
```

Do not run the server installer independently on every operator computer. That would create separate databases rather than one multi-user system.

## Default locations and addresses

`01 - INSTALL SERVER.bat` installs to:

```text
C:\ProgramData\Eaststone\StockControl
```

Default service addresses:

```text
HTTP diagnostic endpoint: http://SERVER-IP:8088
HTTPS user endpoint:      https://stock-control.test:8443
```

The HTTPS hostname and IP are recorded in:

```text
deployment\server-config.ini
```

## Trust model

The server creates one private customer CA. The CA private key and HTTPS private key remain on the server under `infra\certs` and must never be copied to client computers.

The client package contains only:

- `stock-control-ca.crt` — public CA certificate;
- client hostname/IP configuration;
- client setup and hosts helper;
- the BAT-based client setup control.

The CA is imported once into each client’s Local Computer trusted-root store. Routine server-certificate renewals continue to use the same CA, so clients do not need the CA imported again for each renewal.

## Maintenance automation

Server setup registers:

| Task | Frequency | Function |
|---|---:|---|
| Eaststone Stock Control — Health Monitor | At logon and every 30 minutes | Starts Docker when possible, starts/reconciles containers, tests HTTP/HTTPS, checks disk, backup age and certificate expiry. |
| Eaststone Stock Control — Certificate Renewal | Daily at 02:15 | Renews the server certificate when it has fewer than 90 days remaining and restarts Nginx. |

The Docker `backup-scheduler` service creates the daily PostgreSQL custom-format backup and SHA-256 manifest. It defaults to 02:30 Europe/London, but administrators can change the enabled state, time and retention later in the web Admin screen or **ESC Backup Settings**. The destination is a browsable host/network folder bind-mounted outside the containers.

`STOP_WINDOWS.bat` creates a controlled-stop flag. The health monitor respects that flag and does not restart a deliberately stopped system. `START_WINDOWS.bat` clears it.

## Certificate lifetime

New deployments create:

- a private CA valid for approximately 30 years;
- a server certificate valid for 825 days.

The server certificate is automatically renewed using the retained CA. The private CA cannot responsibly be made infinite; the monitor begins warning when fewer than five years remain so a controlled CA rollover can be planned well before expiry.

## GMP and validation position

The generated IQ report records objective installation checks. It is not, by itself, full GMP validation. The validated state should also include approved requirements, risk assessment, configuration specification, OQ/PQ scripts, user acceptance, backup/restore challenge, security testing, change control, SOPs and training.

## Build the commercial release package

On a Windows release workstation, from the approved source folder, run:

```text
BUILD_COMMERCIAL_PACKAGE.bat
```

Outputs are written to:

```text
release\Pharmagrowth Stock Control\
release\Pharmagrowth-Stock-Control-Commercial-Package.zip
```

## Manual fallback

The automated route is recommended. When it fails, use:

- `MANUAL_SERVER_INSTALLATION.md`
- `MANUAL_CLIENT_INSTALLATION.md`
- `TROUBLESHOOTING.md`
- `ADMINISTRATOR_RECOVERY_GUIDE.md`
