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

`System` contains the controlled server runtime. IT should use the numbered top-level launchers rather than running files directly from `System`.

The commercial package may be stored in an approved Windows shared folder. The live application/database are still installed locally under `C:\ProgramData\Eaststone\StockControl` and the Docker/PostgreSQL volume; they do not run from the shared folder.

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

1. Extract the complete commercial package. It may be placed in the approved shared folder used for client distribution.
2. On the server computer, start Docker Desktop and wait until the engine is running.
3. Run `01 - INSTALL SERVER.bat` as Administrator.
4. Allow the Windows UAC prompt.
5. Leave the installation window open until the server completes **and** the client deployment is verified.

The launcher copies the controlled server files into:

```text
C:\ProgramData\Eaststone\StockControl
```

The setup validates Docker, starts the PostgreSQL/FastAPI/Nginx and backup-scheduler stack, applies the database schema, configures HTTPS, installs the server trusted CA, configures hostname/firewall, registers maintenance tasks, creates shortcuts, creates the initial backup and executes IQ checks.

After installation, use the **ESC Backup Settings** shortcut to browse to an approved local/server/network backup folder and to set the daily backup time and retention. These settings can be changed later without reinstalling.

The installer then publishes the completed client configuration back into the same package-level `CLIENT DEPLOYMENT` folder. It does not delete/recreate that shared folder.

## D. Client deployment

The commercial ZIP already contains the complete BAT-based client controls:

```text
CLIENT DEPLOYMENT\
    01 - INSTALL CLIENT.bat
    02 - UNINSTALL CLIENT.bat
    Configure-Hosts.ps1
    client-config.ini
    README.txt
```

Before server installation, `SERVER_IP` is intentionally blank and `stock-control-ca.crt` is not present yet.

Server installation does **not** build a client EXE. It finalises the same folder by:

1. writing the actual server hostname/IP into `client-config.ini`;
2. copying the generated public CA certificate into `stock-control-ca.crt`;
3. verifying that the published `SERVER_IP` is populated and that all required client files exist.

After successful server installation:

```text
CLIENT DEPLOYMENT\
    01 - INSTALL CLIENT.bat
    02 - UNINSTALL CLIENT.bat
    Configure-Hosts.ps1
    client-config.ini
    stock-control-ca.crt
    README.txt
```

On each client computer, browse directly to this same approved shared/network folder and run `01 - INSTALL CLIENT.bat` as Administrator. Copying the folder locally is optional rather than required. The client installer stages the required files into `%TEMP%` before UAC elevation, matching the previous proven working deployment behaviour.

To remove a client computer's Stock Control configuration, run `02 - UNINSTALL CLIENT.bat` as Administrator. It removes only that client's shortcut, hosts mapping, trusted client CA and `HKLM\SOFTWARE\Eaststone\StockControlClient` registration. It does not remove the server, database, stock data or shared package.

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

`Administration & Recovery` contains the server administrator controls:

```text
01 - BACKUP SETTINGS.bat
02 - BACKUP AND RESTORE.bat
03 - COMPLETE UNINSTALL.bat
```

`03 - COMPLETE UNINSTALL.bat` is the one supported **server** uninstall control. There is no duplicate `UNINSTALL_WINDOWS.bat` under `System` and no uninstall EXE.

This is intentionally separate from:

```text
CLIENT DEPLOYMENT\02 - UNINSTALL CLIENT.bat
```

which removes only one client computer's local configuration.

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
