# Automatic Installation — Recommended

## A. Commercial package layout

The IT-facing package is deliberately simplified:

```text
00 - START HERE - INSTALLATION GUIDE.txt
01 - INSTALL SERVER.bat
02 - START SERVER.bat
03 - STOP SERVER.bat
04 - SERVER STATUS.bat
CLIENT DEPLOYMENT\
Administration & Recovery\
Documentation\
System\
```

`System` contains the controlled application/runtime files. IT should use the numbered top-level launchers for normal installation and operation rather than running files directly from `System`.

The release package does **not** use or create self-extracting server/client EXEs.

## B. Prepare the Stock Control host

The host should be an always-on Windows computer on the company network. It requires:

- Windows 10/11 Pro or another approved Windows host environment;
- Docker Desktop configured for Linux containers;
- sufficient local disk space;
- a stable private LAN IPv4 address or DHCP reservation;
- administrator access;
- company firewall/network approval for TCP 8443 and, if retained for diagnostics, TCP 8088.

## C. Install the server

1. Extract the complete commercial package to a local folder.
2. Start Docker Desktop and wait until the engine is running.
3. Right-click `01 - INSTALL SERVER.bat` and select **Run as administrator**.
4. Allow the Windows UAC prompt.
5. Leave the installation window open until completion.

The launcher copies the controlled server files into:

```text
C:\ProgramData\Eaststone\StockControl
```

and then runs the tested server setup from that local installation path.

The setup automatically validates Docker, creates or retains secure configuration, starts the PostgreSQL/FastAPI/Nginx stack, applies the database schema, configures HTTPS, installs the trusted public CA on the server, configures the hostname and firewall, registers maintenance tasks, creates shortcuts, creates the initial backup and executes IQ checks.

## D. Client deployment

The commercial ZIP already contains the BAT-based client setup:

```text
CLIENT DEPLOYMENT\
    01 - INSTALL CLIENT.bat
    Configure-Hosts.ps1
    client-config.ini
    README.txt
```

Before server installation, `SERVER_IP` is intentionally blank and `stock-control-ca.crt` is not present yet.

Server installation does **not** build a client EXE or create a second installer. It only finalises this existing folder by:

1. writing the actual server hostname/IP into `client-config.ini`;
2. copying the generated public CA certificate into `stock-control-ca.crt`.

After successful server installation:

```text
CLIENT DEPLOYMENT\
    01 - INSTALL CLIENT.bat
    Configure-Hosts.ps1
    client-config.ini
    stock-control-ca.crt
    README.txt
```

Copy the complete folder to each client computer and run `01 - INSTALL CLIENT.bat` as Administrator.

## E. Initial login and IQ

Open:

```text
https://stock-control.test:8443
```

Initial credentials:

```text
Username: admin
Password: Admin123!
```

Change the password immediately through the Admin UI.

Review:

```text
C:\ProgramData\Eaststone\StockControl\deployment-records\ESC-IQ-Execution-Latest.html
```

before approving the installation.

## F. Routine controls

Use:

- `02 - START SERVER.bat`
- `03 - STOP SERVER.bat`
- `04 - SERVER STATUS.bat`

Do not use `docker compose down -v` during routine operation because `-v` destroys the PostgreSQL data volume.

## G. Administration and uninstall

`Administration & Recovery` contains the administrator-only controls. The commercial package contains exactly one supported uninstall BAT:

```text
02 - COMPLETE UNINSTALL.bat
```

There is no second `UNINSTALL_WINDOWS.bat` under `System` and no uninstall EXE.

## H. Building the commercial release package

Release/development personnel can create the clean IT-facing package by running:

```text
BUILD_COMMERCIAL_PACKAGE.bat
```

This produces:

```text
release\Pharmagrowth Stock Control\
release\Pharmagrowth-Stock-Control-Commercial-Package.zip
```

The release builder only copies/packages controlled files. It does not compile executable installer wrappers.
