# Commercial Windows Deployment — Release Acceptance Test Plan

## Branch control

Frozen recovery checkpoint:

```text
checkpoint/windows-pwa-working-2026-08-04
```

Implementation/test branch:

```text
feature/backup-restore-simplification
```

Do not merge the implementation branch into `main` or use it on the live server until this plan has been executed, deviations resolved and approval recorded.

## 1. Source and build verification

- [ ] GitHub Actions workflow `Validate Clean Commercial Package` passes all jobs.
- [ ] Python API compiles and imports.
- [ ] React/TypeScript production build succeeds.
- [ ] Shell scripts pass syntax validation.
- [ ] Every PowerShell file passes parser validation.
- [ ] Production Compose base and TLS configuration validate.
- [ ] Windows packaging creates the clean `Pharmagrowth-Stock-Control-Commercial-Package.zip` artifact.
- [ ] The package contains no unexpected EXE or obsolete installer-builder tooling.
- [ ] PowerShell parsing, API tests/import, frontend build and Compose validation pass.

## 2. Clean local server installation

Use a non-production Windows computer.

- [ ] Remove the previous test installation using its matching uninstaller after preserving any needed test evidence.
- [ ] Start Docker Desktop.
- [ ] Run `01 - INSTALL SERVER.bat` as administrator.
- [ ] Confirm installation path is `C:\ProgramData\Eaststone\StockControl`.
- [ ] Confirm installer detects/records the correct company-network IPv4 address.
- [ ] Confirm database initialiser completes.
- [ ] Confirm HTTP health on 8088.
- [ ] Confirm HTTPS health on 8443.
- [ ] Confirm `stock-control.test` opens without certificate warning on the host.
- [ ] Confirm `admin / Admin123!` works once.
- [ ] Change the administrator password.
- [ ] Confirm the IQ report was generated.
- [ ] Confirm first verified backup and SHA-256 manifest were generated.

## 3. Automatic maintenance installation

- [ ] `STATUS_WINDOWS.bat` shows healthy containers.
- [ ] Task Scheduler contains:
  - [ ] Health Monitor
  - [ ] Certificate Renewal
- [ ] `backup-scheduler` container is running and has written its status JSON.
- [ ] Run each Windows scheduled task manually once.
- [ ] Review each log for successful completion.
- [ ] Confirm health status JSON contains current HTTP/HTTPS/certificate/disk/backup data.
- [ ] Confirm the health task repetition has no end date.
- [ ] In the web Admin screen, change the automatic backup time, save it, refresh and confirm it persists.
- [ ] In **ESC Backup Settings**, browse to another approved local test folder, save, and confirm manual/automatic backups use it outside the container.
- [ ] Change the time/folder back and confirm existing backups were not deleted.

## 4. Start, stop and recovery

- [ ] Run `STOP_WINDOWS.bat`.
- [ ] Confirm containers stop and the PostgreSQL volume remains.
- [ ] Run the health task; confirm it respects `manual-stop.flag`.
- [ ] Run `START_WINDOWS.bat`.
- [ ] Confirm the flag is cleared and HTTPS login returns.
- [ ] Close Docker Desktop deliberately.
- [ ] Run the health monitor/start process and document whether Docker Desktop recovery works in the target environment.
- [ ] Restart the Windows host and verify the approved operational recovery model.

## 5. Automatic material numbering

- [ ] Open New Material.
- [ ] Confirm code is read-only and previews `MAT0001` on a clean database.
- [ ] Save the material.
- [ ] Confirm saved code is `MAT0001`.
- [ ] Create another material and confirm `MAT0002`.
- [ ] Attempt concurrent creation from two browser sessions and confirm unique codes.
- [ ] Confirm deleted/failed records do not cause code reuse.
- [ ] Confirm material edit cannot change the code.
- [ ] Confirm audit behavior for material creation/edit remains available.

## 6. Customer name through consumption and analytics

- [ ] Create/identify an active Product List item.
- [ ] Create a compliant multi-material consumption.
- [ ] Enter customer name using representative value `Cohen's C100, Stock`.
- [ ] Confirm the customer appears on every linked consumption row.
- [ ] Confirm Consumption search and customer filter work.
- [ ] Confirm CSV export includes Customer Name.
- [ ] Confirm Product Analytics batch table includes customer.
- [ ] Confirm Product Analytics CSV and PDF/print report include customer.
- [ ] Confirm Batch Analytics header/metric includes customer.
- [ ] Confirm Batch Analytics CSV and PDF/print report include customer.
- [ ] Create a Cancelled BMR with customer and verify the same propagation.
- [ ] Correct customer through authorised edit, enter an edit reason and confirm:
  - [ ] every linked row updates;
  - [ ] `BATCH_CUSTOMER_UPDATED` appears in Audit Trail;
  - [ ] before/after customer values and reason are recorded.

## 7. ADMIN permission invariant

- [ ] Sign in as ADMIN.
- [ ] Confirm Admin, Audit Trail, Analytics, all edit controls and database tools are available.
- [ ] Open role/permission matrix for ADMIN.
- [ ] Confirm every registered permission is checked.
- [ ] Attempt to save a partial ADMIN permission set.
- [ ] Reopen matrix and confirm every permission remains granted.
- [ ] Confirm the permission change/repair is audit-trailed.
- [ ] Confirm non-ADMIN roles remain configurable and enforced normally.

## 8. Client setup

Use a second Windows test computer on the same network.

- [ ] Confirm the package-level `CLIENT DEPLOYMENT` folder was finalised with the server IP and public CA certificate.
- [ ] Confirm `01 - INSTALL CLIENT.bat` and `02 - UNINSTALL CLIENT.bat` remain present.
- [ ] Confirm client package contains public CA but no `.key` files.
- [ ] Run client setup as administrator.
- [ ] Confirm Local Computer Trusted Root contains the Stock Control CA.
- [ ] Confirm hosts entry uses the correct server IP.
- [ ] Confirm desktop and Start-menu shortcuts exist.
- [ ] Confirm `https://stock-control.test:8443` opens without warning.
- [ ] Confirm an individual user can log in.
- [ ] Confirm concurrent operation from server browser and client browser does not exchange identities/sessions.
- [ ] Confirm the installed app/PWA opens after browser restart.

## 9. Certificate renewal test

Do not replace the private CA during this test.

- [ ] Record CA thumbprint and expiry.
- [ ] Record server certificate thumbprint and expiry.
- [ ] Force a server-certificate renewal in the test environment using an approved test method.
- [ ] Confirm CA thumbprint remains unchanged.
- [ ] Confirm server certificate thumbprint changes.
- [ ] Confirm Nginx restarts/reloads.
- [ ] Confirm existing client still trusts the site without re-importing the CA.
- [ ] Confirm renewal log records success.
- [ ] Confirm CA-expiry warning logic is documented and testable.

## 10. Backup and restore challenge

Use only a segregated test installation.

- [ ] Create identifiable test data.
- [ ] Create verified manual backup.
- [ ] Confirm the simplified `StockControl_Manual_<date>_<time>.dump` naming does not expose/require the internal database name.
- [ ] Confirm manifest SHA-256 matches.
- [ ] Create additional records after backup.
- [ ] Use the browser file selector to restore the selected physical `.dump` file.
- [ ] Confirm only one restore confirmation is presented and no typed phrase/database name is required.
- [ ] Confirm pre-restore safety backup is created.
- [ ] Confirm restore uses a new internal recovery database and leaves the previous database available for rollback.
- [ ] Confirm the current controlled schema bootstrap runs before the recovery database is activated.
- [ ] Confirm an invalid/corrupt dump does not change the active database.
- [ ] Confirm records return to the selected backup state.
- [ ] Confirm login, permissions, audit, material numbering and customer analytics function after restore.
- [ ] Confirm a new post-restore backup can be created.
- [ ] Document recovery point and data removed by the test restore.

## 11. Uninstall challenge

Use a disposable test installation.

- [ ] Create test data and certificate/client setup.
- [ ] Run `Administration & Recovery\03 - COMPLETE UNINSTALL.bat`.
- [ ] Confirm both exact destructive confirmations are required.
- [ ] Confirm project containers, network, images and DB volume are removed.
- [ ] Confirm scheduled tasks are removed.
- [ ] Confirm firewall rules are removed.
- [ ] Confirm server hosts entry and server trusted root are removed.
- [ ] Confirm registry/shortcuts/config/local default backups/logs are removed as selected.
- [ ] Confirm a configured external/network backup folder is retained.
- [ ] Confirm Docker Desktop and unrelated Docker projects are not removed.

## 12. Regression test

Confirm existing functions remain operational:

- [ ] Authentication and individual sessions
- [ ] User/role administration
- [ ] Materials Library
- [ ] Approved manufacturers
- [ ] Goods receipts and cost calculations
- [ ] Live lots and split statuses
- [ ] Quarantine policy and log
- [ ] Standard consumption and rejected-batch escalation
- [ ] Cancelled BMR
- [ ] Alerts and thresholds
- [ ] Audit Trail and exports
- [ ] Analytics and exports
- [ ] Admin DB tools
- [ ] PWA manifest/service worker/update prompt

## 13. Documentation and release approval

- [ ] Automatic installation guide approved.
- [ ] Manual server/client procedures approved.
- [ ] Troubleshooting guide approved.
- [ ] Administrator Recovery Guide approved.
- [ ] Backup/Restore guide approved.
- [ ] Certificate Lifecycle guide approved.
- [ ] IQ executed and approved.
- [ ] OQ/PQ/UAT and validation impact assessed.
- [ ] Release notes and version identifier assigned.
- [ ] Rollback to checkpoint demonstrated or documented.
- [ ] Supplier/customer support and maintenance responsibilities agreed.

## Release decision

| Decision | Selection |
|---|---|
| Approved for further validation | ☐ |
| Approved for controlled server pilot | ☐ |
| Approved for production use | ☐ |
| Rejected / remediation required | ☐ |

Comments/deviations:


Executed by: ____________________ Date: __________

Reviewed by: ____________________ Date: __________

QA/System Owner approval: ____________________ Date: __________
