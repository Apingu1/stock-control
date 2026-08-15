# Eaststone Stock Control — Windows Deployment Documents

Use this index for the commercial Windows server/client deployment supplied by **Pharmagrowth Consulting Ltd**.

## Start here

1. [IT Installation Guide](IT_INSTALLATION_GUIDE.txt)
2. [Automatic Installation — Recommended](AUTOMATIC_INSTALLATION.md)
3. [Deployment Overview](DEPLOYMENT_OVERVIEW.md)
4. [Installation Qualification Protocol and Report](INSTALLATION_QUALIFICATION_REPORT.md)

## Commercial package layout

```text
00 - START HERE - INSTALLATION GUIDE.txt
01 - INSTALL SERVER.bat
02 - START SERVER.bat
03 - STOP SERVER.bat
04 - SERVER STATUS.bat
UNINSTALL_WINDOWS.bat
CLIENT DEPLOYMENT\
Administration & Recovery\
Documentation\
System\
```

The supported package does not build or distribute unsigned self-extracting installer EXEs.

The extracted commercial package may be kept in an approved Windows shared folder. The live server runtime is still copied locally to `C:\ProgramData\Eaststone\StockControl` and the PostgreSQL database remains in its local Docker volume.

## Client deployment

The commercial ZIP already contains the complete client controls:

```text
CLIENT DEPLOYMENT\
    01 - INSTALL CLIENT.bat
    02 - UNINSTALL CLIENT.bat
    Configure-Hosts.ps1
    client-config.ini
    README.txt
```

Before server installation, `SERVER_IP` is blank and no server-specific CA certificate is present.

Server installation finalises the same folder by adding the real server address and `stock-control-ca.crt`. The server installer verifies the published shared client package before reporting it ready. It does not build or create a client EXE.

After successful server installation, client computers may browse directly to the approved shared `CLIENT DEPLOYMENT` folder and run `01 - INSTALL CLIENT.bat` as Administrator. The installer stages the required files locally before UAC elevation, matching the previous working Windows deployment behaviour.

`02 - UNINSTALL CLIENT.bat` removes only the selected client computer's local Stock Control configuration. It does not affect the server, database, stock data or shared package.

## Administration and recovery

The supported **server** uninstall control is supplied at package root beside the server launchers:

```text
UNINSTALL_WINDOWS.bat
```

This is separate from the client-only uninstall under `CLIENT DEPLOYMENT`. There is no duplicate server uninstaller under `Administration & Recovery` or `System`, and no uninstall EXE.

Backup administration is provided by:

```text
Administration & Recovery\01 - BACKUP SETTINGS.bat
Administration & Recovery\02 - BACKUP AND RESTORE.bat
```

The first control provides the server-folder browser and adjustable automatic daily time/retention. The second provides manual backup and guided file-browser restore.

## Manual fallback

- [Manual Server Installation](MANUAL_SERVER_INSTALLATION.md)
- [Manual Client Installation](MANUAL_CLIENT_INSTALLATION.md)

## Operations and maintenance

- [Administrator Recovery Guide](ADMINISTRATOR_RECOVERY_GUIDE.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [Backup and Restore Operating Guide](BACKUP_AND_RESTORE.md)
- [Certificate Lifecycle and Renewal](CERTIFICATE_LIFECYCLE.md)

## Internal server controls

The installed server runtime under `C:\ProgramData\Eaststone\StockControl` retains only the server controls required for installation, operation and maintenance, including:

```text
ESC_SERVER_SETUP_WINDOWS.bat
ESC_BACKUP_SETTINGS_WINDOWS.bat
ESC_BACKUP_RESTORE_WINDOWS.bat
INSTALL_WINDOWS.bat
ENABLE_HTTPS_WINDOWS.bat
START_WINDOWS.bat
STOP_WINDOWS.bat
STATUS_WINDOWS.bat
RESET_ADMIN_PASSWORD_WINDOWS.bat
```

Release personnel can generate the clean customer-facing ZIP with:

```text
BUILD_COMMERCIAL_PACKAGE.bat
```

## Validation note

The installer-generated IQ report is objective installation evidence. It does not replace the organisation's full validation lifecycle, including approved URS, risk assessment, configuration specification, OQ/PQ/UAT, backup/restore challenge, security assessment, SOPs, training and change control.
