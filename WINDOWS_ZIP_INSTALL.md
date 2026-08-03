# Windows ZIP installation

This is the simplest Windows server test route. It does not require the user to
type PowerShell commands or run the Linux shell scripts manually.

## Requirements

- Docker Desktop or Docker Engine is installed.
- Docker is configured for Linux containers.
- Docker is running before installation.
- The Windows user can write to the selected installation folder.
- Ports 8088 and 8443 are not already occupied.

A mapped network drive such as `N:` may work, but Docker Desktop can refuse or
perform poorly when its build context is on a mapped share. When the installer
reports a mount, permissions or build-context failure, extract the application
to a local server path such as:

```text
C:\Applications\ESC-Stock-Control
```

The `N:` folder can still be used for approved deployment records and backups.
Do not place PostgreSQL's live database directory directly on a mapped share.

## Download and extract

1. Open the GitHub branch:
   `feature/pwa-production-deployment-test`.
2. Select **Code → Download ZIP**.
3. Extract the ZIP.
4. Copy the contents of the extracted repository folder into:

```text
N:\Quality\QA\ESC -Stock Control
```

The root of that folder must contain:

```text
INSTALL_WINDOWS.bat
START_WINDOWS.bat
STOP_WINDOWS.bat
STATUS_WINDOWS.bat
ENABLE_HTTPS_WINDOWS.bat
infra
api
web
```

Avoid leaving an unnecessary nested folder such as:

```text
N:\Quality\QA\ESC -Stock Control\stock-control-feature-pwa-production-deployment-test\
```

It can still work, but the batch files must be run from the repository root.

## Install

Double-click:

```text
INSTALL_WINDOWS.bat
```

The installer:

- checks that Docker exists and is running;
- warns when it detects a mapped network drive;
- creates `.env` when it does not already exist;
- generates secure test database and JWT secrets through Docker;
- builds the PostgreSQL, FastAPI and compiled React/Nginx containers;
- waits for `/api/health`;
- opens `http://localhost:8088`;
- creates an Eaststone Stock Control shortcut on the server desktop.

The generated `.env` is not overwritten when the installer is run again.

## Control files

Use:

```text
START_WINDOWS.bat
STOP_WINDOWS.bat
STATUS_WINDOWS.bat
```

Stopping preserves the database volume.

Do not manually add `-v` to a Docker Compose down command unless intentionally
deleting the production-test database.

## Access from another computer

Allow inbound TCP port 8088 in Windows Firewall or the server firewall, then
open:

```text
http://SERVER-IP:8088
```

This tests normal browser access and multi-user behaviour.

## Make the PWA installable

Remote PWA installation requires a trusted HTTPS origin. Double-click:

```text
ENABLE_HTTPS_WINDOWS.bat
```

Enter:

- a stable internal hostname, such as `stock-control.test`;
- the server's fixed IPv4 address.

The script generates a private test CA and certificate using a temporary Docker
container, then starts HTTPS on port 8443.

Copy only this public certificate to each test computer:

```text
infra\certs\stock-control-ca.crt
```

Import it into the **Local Computer → Trusted Root Certification Authorities**
store. Add the displayed server-IP/hostname entry to the Windows hosts file, or
create the equivalent internal DNS record.

Then open:

```text
https://stock-control.test:8443
```

Do not distribute:

```text
stock-control-ca.key
stock-control.key
```

Those private keys remain on the server.
