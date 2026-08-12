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

The release package does **not** use or create self-extracting server/client EXEs. The validated deployment path uses the BAT launchers and server-specific client deployment folder.

## B. Prepare the Stock Control host

The host should be an always-on Windows computer on the company network. It requires:

- Windows 10/11 Pro or another approved Windows host environment;
- Docker Desktop configured for Linux containers;
- sufficient local disk space;
- a stable private LAN IPv4 address or DHCP reservation;
- administrator access;
- company firewall/network approval for TCP 8443 and, if retained for diagnostics, TCP 8088.

Docker Desktop is not supported by Docker on Windows Server editions. For Windows Server, use an approved supported architecture rather than treating Docker Desktop as a validated Windows Server service.

## C. Install the server

1. Extract the complete commercial package to a local folder.
2. Start Docker Desktop and wait until the engine is running.
3. Right-click `01 - INSTALL SERVER.bat` and select **Run as administrator**.
4. Allow the Windows UAC prompt.
5. Leave the installation window open until completion.

The commercial launcher copies the controlled application files into:

```text
C:\ProgramData\Eaststone\StockControl
```

and then runs the tested server setup from that local installation path.

The setup automatically:

1. validates Docker;
2. creates secure database/JWT secrets;
3. builds and starts PostgreSQL, FastAPI and compiled Nginx/React containers;
4. applies the database schema in controlled order;
5. creates and verifies the initial administrator;
6. creates or reuses the private Stock Control CA;
7. issues the HTTPS server certificate;
8. starts HTTPS on port 8443;
9. imports the public CA into the server Local Computer trusted-root store;
10. adds the server local hosts entry;
11. opens Windows Firewall rules for ports 8088 and 8443 on Domain/Private profiles;
12. registers automatic health, certificate-renewal and backup tasks;
13. creates desktop and Start-menu shortcuts;
14. creates the server-specific client deployment folder;
15. creates the initial verified database backup;
16. executes IQ checks and writes the report.

After setup, the commercial launcher also copies the generated client files back into the package-level `CLIENT DEPLOYMENT` folder for controlled distribution.

## D. Initial login

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

## E. Review installation evidence

Open:

```text
C:\ProgramData\Eaststone\StockControl\deployment-records\ESC-IQ-Execution-Latest.html
```

Review failed checks/deviations before approving the installation.

Also review the operational logs under:

```text
C:\ProgramData\Eaststone\StockControl\logs\
```

## F. Deploy clients

After successful server installation, the package-level `CLIENT DEPLOYMENT` folder contains the current server-specific files:

```text
ESC_CLIENT_SETUP_WINDOWS.bat
Configure-Hosts.ps1
client-config.ini
stock-control-ca.crt
```

No client EXE is required or created.

On each client computer:

1. copy the **complete** `CLIENT DEPLOYMENT` folder to the client computer;
2. right-click `ESC_CLIENT_SETUP_WINDOWS.bat` and select **Run as administrator**;
3. accept the UAC prompt;
4. allow setup to install the public CA, configure the hostname and create the application shortcut;
5. confirm it reports successful HTTPS access;
6. open **Eaststone Stock Control** from the desktop or Start menu;
7. log in using that user's individual account.

The client folder contains the public CA only. Server private keys remain on the server.

## G. Routine controls

Use the numbered top-level controls:

- `02 - START SERVER.bat`
- `03 - STOP SERVER.bat`
- `04 - SERVER STATUS.bat`

Administrator-only backup/restore and complete uninstall controls are under `Administration & Recovery` so they are not confused with routine operation.

Do not use `docker compose down -v` during routine operation; `-v` destroys the PostgreSQL data volume.

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

The release builder only copies/packages controlled files. It does not compile or generate executable installers.
