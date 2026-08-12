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
CLIENT DEPLOYMENT\
Administration & Recovery\
Documentation\
System\
```

The supported package does not build or distribute unsigned self-extracting installer EXEs.

## Client deployment

The commercial ZIP already contains:

```text
CLIENT DEPLOYMENT\
    01 - INSTALL CLIENT.bat
    Configure-Hosts.ps1
    client-config.ini
    README.txt
```

Server installation only adds the server-specific public CA certificate and updates `client-config.ini` with the actual server address. It does not build or create a client EXE.

After server installation, copy the whole `CLIENT DEPLOYMENT` folder to each client computer and run `01 - INSTALL CLIENT.bat` as Administrator.

## Administration and recovery

The commercial package contains one supported uninstall control only:

```text
Administration & Recovery\02 - COMPLETE UNINSTALL.bat
```

There is no duplicate `UNINSTALL_WINDOWS.bat` under `System` and no uninstall EXE.

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
