# Eaststone Stock Control — Windows Deployment Documents

Use this index for the commercial Windows server/client deployment supplied by **Pharmagrowth Consulting Ltd**.

## Start here

1. [IT Installation Guide](IT_INSTALLATION_GUIDE.txt)
2. [Automatic Installation — Recommended](AUTOMATIC_INSTALLATION.md)
3. [Deployment Overview](DEPLOYMENT_OVERVIEW.md)
4. [Installation Qualification Protocol and Report](INSTALLATION_QUALIFICATION_REPORT.md)

## Commercial package layout

The customer-facing release package is intentionally simplified:

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

The `System` folder contains the controlled technical runtime. IT should normally use only the numbered top-level launchers.

The supported package no longer builds or distributes unsigned self-extracting installer EXEs. The working deployment method is the server BAT launcher plus the generated `CLIENT DEPLOYMENT` folder.

## Client deployment

A successful server installation creates:

```text
ESC_CLIENT_SETUP_WINDOWS.bat
Configure-Hosts.ps1
client-config.ini
stock-control-ca.crt
```

These files are copied into the release package's `CLIENT DEPLOYMENT` folder. Copy the whole folder to each client computer and run `ESC_CLIENT_SETUP_WINDOWS.bat` as Administrator.

## Manual fallback

- [Manual Server Installation](MANUAL_SERVER_INSTALLATION.md)
- [Manual Client Installation](MANUAL_CLIENT_INSTALLATION.md)

## Operations and maintenance

- [Administrator Recovery Guide](ADMINISTRATOR_RECOVERY_GUIDE.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [Backup and Restore Operating Guide](BACKUP_AND_RESTORE.md)
- [Certificate Lifecycle and Renewal](CERTIFICATE_LIFECYCLE.md)

## Internal Windows controls

The installed runtime under `C:\ProgramData\Eaststone\StockControl` retains the internal controls required by the numbered release launchers and maintenance tasks, including:

```text
ESC_SERVER_SETUP_WINDOWS.bat
ESC_CLIENT_SETUP_WINDOWS.bat
ESC_BACKUP_RESTORE_WINDOWS.bat
INSTALL_WINDOWS.bat
ENABLE_HTTPS_WINDOWS.bat
START_WINDOWS.bat
STOP_WINDOWS.bat
STATUS_WINDOWS.bat
UNINSTALL_WINDOWS.bat
```

Release personnel can generate the clean customer-facing ZIP with:

```text
BUILD_COMMERCIAL_PACKAGE.bat
```

This packaging step copies controlled files only and does not compile executable installer wrappers.

## Validation note

The installer-generated IQ report is objective installation evidence. It does not replace the organisation's full validation lifecycle, including approved URS, risk assessment, configuration specification, OQ/PQ/UAT, backup/restore challenge, security assessment, SOPs, training and change control.
