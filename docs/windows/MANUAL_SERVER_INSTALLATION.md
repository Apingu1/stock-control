# Manual Server Installation — Fallback Procedure

Use this procedure when `01 - INSTALL SERVER.bat` cannot complete automatically. The automatic route remains recommended because it performs the same steps consistently and records installation evidence.

## 1. Confirm prerequisites

1. Use an always-on Windows host connected to the company network.
2. Install Docker Desktop and configure Linux containers.
3. Open Docker Desktop and wait until it reports that Docker is running.
4. Ensure the host has a stable IPv4 address or DHCP reservation.
5. Sign in with a Windows account that has local administrator rights.

## 2. Extract the approved release locally

Extract the approved release ZIP to a local host path such as:

```text
C:\ProgramData\Eaststone\StockControl
```

Do not run the installed application from a mapped network drive. A network share may hold the approved package and copied backups, but Docker build contexts and live bind mounts should remain on the host’s local storage.

The installation directory should directly contain:

```text
INSTALL_WINDOWS.bat
ENABLE_HTTPS_WINDOWS.bat
START_WINDOWS.bat
STOP_WINDOWS.bat
STATUS_WINDOWS.bat
UNINSTALL_WINDOWS.bat
api\
db\
infra\
web\
windows\
```

## 3. Install the HTTP application

Double-click:

```text
INSTALL_WINDOWS.bat
```

The script will:

- create `.env` with secure generated secrets;
- build the production containers;
- initialise or upgrade the database in controlled order;
- create/activate `admin`;
- verify `admin / Admin123!` through the login endpoint;
- open `http://localhost:8088`.

Verify:

```text
http://localhost:8088/api/health
```

Expected response:

```json
{"ok":true,"service":"stock-control"}
```

Log in to `http://localhost:8088` using:

```text
admin
Admin123!
```

Do not proceed to client deployment until login succeeds.

## 4. Identify the host IPv4 address

Open Command Prompt and run:

```bat
ipconfig
```

Record the IPv4 address of the company-network adapter. Do not use the Docker, WSL, loopback or disconnected-adapter address.

Example:

```text
192.168.1.115
```

## 5. Generate and start HTTPS

Double-click:

```text
ENABLE_HTTPS_WINDOWS.bat
```

Enter:

```text
Internal hostname: stock-control.test
Server IPv4 address: the address recorded above
```

The script creates/reuses:

```text
infra\certs\stock-control-ca.crt       public CA certificate
infra\certs\stock-control-ca.key       private CA key — server only
infra\certs\stock-control.crt          HTTPS server certificate
infra\certs\stock-control.key          HTTPS private key — server only
```

It starts the secure site on:

```text
https://stock-control.test:8443
```

## 6. Trust the public CA on the server

Import only:

```text
infra\certs\stock-control-ca.crt
```

Manual Windows import:

1. double-click `stock-control-ca.crt`;
2. select **Install Certificate**;
3. choose **Local Machine**;
4. approve UAC;
5. choose **Place all certificates in the following store**;
6. select **Trusted Root Certification Authorities**;
7. complete the wizard;
8. close all Chrome/Edge windows and reopen the browser.

Never import or distribute either `.key` file.

PowerShell fallback, run as Administrator:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\Install-TrustedRoot.ps1 -CertificatePath infra\certs\stock-control-ca.crt -ThumbprintRecordPath deployment\trusted-root-thumbprint.txt
```

## 7. Configure the server hosts entry

Open Notepad as Administrator and edit:

```text
C:\Windows\System32\drivers\etc\hosts
```

Add:

```text
127.0.0.1 stock-control.test
```

Save the file as exactly `hosts`, not `hosts.txt`, then run:

```bat
ipconfig /flushdns
ping stock-control.test
```

Expected resolution on the server:

```text
stock-control.test [127.0.0.1]
```

Automated helper, run as Administrator:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\Configure-Hosts.ps1 -Hostname stock-control.test -IpAddress 127.0.0.1
```

## 8. Configure Windows Firewall

Run Command Prompt as Administrator:

```bat
netsh advfirewall firewall add rule name="Eaststone Stock Control HTTP" dir=in action=allow protocol=TCP localport=8088 profile=domain,private
netsh advfirewall firewall add rule name="Eaststone Stock Control HTTPS" dir=in action=allow protocol=TCP localport=8443 profile=domain,private
```

Port 8443 is the normal user endpoint. Port 8088 may be restricted to administrators if it is retained only for diagnostics.

## 9. Record server configuration

Create:

```text
deployment\server-config.ini
```

Contents:

```ini
TLS_HOSTNAME=stock-control.test
SERVER_IP=192.168.1.115
APP_HTTP_PORT=8088
APP_HTTPS_PORT=8443
INSTALL_ROOT=C:\ProgramData\Eaststone\StockControl
```

Use the actual host IP and installation path.

## 10. Register automatic maintenance

Open PowerShell as Administrator in the installation folder:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\Register-MaintenanceTasks.ps1 -InstallRoot "C:\ProgramData\Eaststone\StockControl"
```

Confirm in Windows Task Scheduler:

```text
Eaststone Stock Control - Health Monitor
Eaststone Stock Control - Certificate Renewal
```

Automatic database backups are provided by the always-on `backup-scheduler` Docker service rather than an interactive Windows scheduled task. Open `ESC_BACKUP_SETTINGS_WINDOWS.bat` to browse to the physical backup folder and set/change the enabled state, daily time and retention.

## 11. Create the client deployment folder

Create:

```text
client-deployment
```

Copy into it:

```text
infra\certs\stock-control-ca.crt
ESC_CLIENT_SETUP_WINDOWS.bat
windows\Configure-Hosts.ps1
```

Create `client-deployment\client-config.ini`:

```ini
TLS_HOSTNAME=stock-control.test
SERVER_IP=192.168.1.115
APP_HTTPS_PORT=8443
```

Build the customer-specific client executable:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\Build-ClientInstaller.ps1 -ClientPackageDirectory "C:\ProgramData\Eaststone\StockControl\client-deployment"
```

## 12. Create initial backup and IQ evidence

Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\Automatic-Backup.ps1 -InstallRoot "C:\ProgramData\Eaststone\StockControl" -Reason "Initial post-installation backup"
```

Then:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\Generate-IQReport.ps1 -InstallRoot "C:\ProgramData\Eaststone\StockControl" -AdminPassword "Admin123!"
```

Review:

```text
deployment-records\ESC-IQ-Execution-Latest.html
```

## 13. Final checks

Open:

```text
https://stock-control.test:8443
```

Confirm:

- no browser certificate warning;
- login succeeds;
- Materials, Receipts, Consumption, Live Lots, Analytics and Audit pages load;
- admin has every permission;
- `STATUS_WINDOWS.bat` reports healthy services;
- client computer can reach TCP 8443;
- the initial database backup and manifest exist.

Change the initial administrator password after qualification evidence is captured.
