# Automatic Installation — Recommended

## A. Prepare the Stock Control host

The host should be an always-on Windows computer on the company network. It requires:

- Windows 10/11 Pro or a supported Windows environment for Docker;
- Docker Desktop configured for Linux containers;
- sufficient local disk space;
- a stable IPv4 address or DHCP reservation;
- administrator access;
- company firewall/network approval for TCP 8443 and, if retained for diagnostics, TCP 8088.

Docker Desktop is not supported by Docker on Windows Server editions. For Windows Server, use an approved Linux VM or supported container-host architecture rather than treating Docker Desktop as a validated production service.

## B. Run ESC Server Setup.exe

1. Copy `ESC Server Setup.exe` to the intended host.
2. Start Docker Desktop and wait until the engine is running. The installer also attempts to start it when installed but stopped.
3. Right-click `ESC Server Setup.exe` and select **Run as administrator**. Double-clicking also requests elevation automatically.
4. Allow the Windows UAC prompt.
5. Leave the installation window open until completion.

The installer automatically:

1. extracts the release to `C:\ProgramData\Eaststone\StockControl`;
2. validates Docker;
3. creates secure database/JWT secrets;
4. builds and starts PostgreSQL, FastAPI and compiled Nginx/React containers;
5. applies the database schema in controlled order;
6. creates and verifies the initial administrator;
7. creates or reuses the private Stock Control CA;
8. issues the HTTPS server certificate;
9. starts HTTPS on port 8443;
10. imports the public CA into the server’s Local Computer trusted-root store;
11. adds the server’s local hosts entry;
12. opens Windows Firewall rules for ports 8088 and 8443 on Domain/Private profiles;
13. registers automatic health, certificate-renewal and backup tasks;
14. creates desktop and Start-menu shortcuts;
15. creates a customer-specific client deployment package;
16. creates the initial verified database backup;
17. executes IQ checks and writes the report.

## C. Initial login

Open:

```text
https://stock-control.test:8443
```

Initial credentials:

```text
Username: admin
Password: Admin123!
```

Change the password immediately through the Admin UI. Record the controlled administrator recovery procedure; do not keep `Admin123!` as a production credential.

## D. Review installation evidence

Open:

```text
C:\ProgramData\Eaststone\StockControl\deployment-records\ESC-IQ-Execution-Latest.html
```

Review any failed check and document deviations before approving the installation.

Also review:

```text
logs\health-monitor.log
logs\certificate-renewal.log
logs\backup.log
logs\health-status.json
```

## E. Deploy clients

The server produces:

```text
C:\ProgramData\Eaststone\StockControl\client-deployment\ESC Client Setup.exe
```

Copy the whole `client-deployment` folder to a controlled shared location, or distribute the executable generated there.

On each operator computer:

1. run `ESC Client Setup.exe` as administrator;
2. accept the UAC prompt;
3. allow the setup to install the public CA, configure the hostname and create the app shortcuts;
4. confirm it reports successful HTTPS access;
5. open **Eaststone Stock Control** from the desktop or Start menu;
6. log in using that operator’s individual account.

The client package contains no server private key.

## F. Prefer central IT deployment where available

For managed domain environments, IT should centrally deploy:

- the public CA through Active Directory Group Policy or Intune;
- `stock-control.test` through internal DNS rather than hosts files;
- the web-app shortcut or Edge web-app policy;
- firewall/network policy as required.

Under central deployment, the client executable is a fallback rather than a requirement.

## G. Build release executables

From the approved source/release folder on Windows:

```text
BUILD_WINDOWS_INSTALLERS.bat
```

This creates the server, uninstall and backup/restore executables under `dist`. The client executable is created only after server setup because it must contain the installed server’s public CA and connection settings.

## H. Routine controls

- **Start:** `START_WINDOWS.bat`
- **Controlled stop:** `STOP_WINDOWS.bat`
- **Status and diagnostics:** `STATUS_WINDOWS.bat`
- **Backup/restore:** `ESC Backup and Restore Tool.exe` or `ESC_BACKUP_RESTORE_WINDOWS.bat`
- **Complete uninstall:** `ESC Uninstall.exe` or `UNINSTALL_WINDOWS.bat`

Do not use `docker compose down -v` during routine operation; `-v` destroys the PostgreSQL data volume.
