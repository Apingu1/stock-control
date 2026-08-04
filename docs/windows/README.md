# Eaststone Stock Control — Windows Deployment Documents

Use this index for the commercial Windows server/client deployment.

## Start here

1. [Deployment Overview](DEPLOYMENT_OVERVIEW.md)
2. [Automatic Installation — Recommended](AUTOMATIC_INSTALLATION.md)
3. [Installation Qualification Protocol and Report](INSTALLATION_QUALIFICATION_REPORT.md)

## Manual fallback

- [Manual Server Installation](MANUAL_SERVER_INSTALLATION.md)
- [Manual Client Installation](MANUAL_CLIENT_INSTALLATION.md)

## Operations and maintenance

- [Administrator Recovery Guide](ADMINISTRATOR_RECOVERY_GUIDE.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [Backup and Restore Operating Guide](BACKUP_AND_RESTORE.md)
- [Certificate Lifecycle and Renewal](CERTIFICATE_LIFECYCLE.md)

## Supplied Windows controls

```text
ESC_SERVER_SETUP_WINDOWS.bat      recommended elevated server setup source launcher
ESC_CLIENT_SETUP_WINDOWS.bat      elevated client setup source launcher
ESC_BACKUP_RESTORE_WINDOWS.bat    backup/restore launcher
INSTALL_WINDOWS.bat               base application/database installer
ENABLE_HTTPS_WINDOWS.bat          HTTPS setup/renewal helper
START_WINDOWS.bat                 start and automatic recovery
STOP_WINDOWS.bat                  controlled stop preserving data
STATUS_WINDOWS.bat                operational status and diagnostics
RESET_ADMIN_PASSWORD_WINDOWS.bat  controlled bootstrap password reset
UNINSTALL_WINDOWS.bat             complete destructive uninstall
BUILD_WINDOWS_INSTALLERS.bat      builds distributable Windows executables
```

Built release executables:

```text
ESC Server Setup.exe
ESC Uninstall.exe
ESC Backup and Restore Tool.exe
```

The installed server generates its own customer-specific:

```text
ESC Client Setup.exe
```

## Validation note

The installer-generated IQ report is objective installation evidence. It does not replace the organisation’s full validation lifecycle, including approved URS, risk assessment, configuration specification, OQ/PQ/UAT, backup/restore challenge, security assessment, SOPs, training and change control.
