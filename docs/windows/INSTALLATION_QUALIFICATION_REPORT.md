# Installation Qualification Protocol and Report

## Document control

| Field | Entry |
|---|---|
| System | Eaststone Stock Control |
| Document title | Installation Qualification Protocol and Report |
| Version | To be assigned under document control |
| Site/customer |  |
| Installation location |  |
| Change control reference |  |
| Supplier release/version |  |
| Date executed |  |
| Executed by |  |
| Reviewed by |  |
| Approved by |  |

## 1. Purpose

To provide documented evidence that Eaststone Stock Control and its supporting Windows/Docker components have been installed in the approved environment according to the controlled configuration and are available for subsequent operational qualification and user acceptance.

## 2. Scope

This IQ covers:

- host identity and operating environment;
- approved installation package and path;
- Docker/Compose availability;
- PostgreSQL, API, database-initialiser and web containers;
- HTTP/HTTPS health;
- private CA and server-certificate installation;
- hostname and firewall configuration;
- automatic health, renewal and backup tasks;
- initial administrator authentication;
- client deployment package generation;
- installation backup;
- installation evidence and deviations.

It does not replace OQ/PQ, functional testing, data migration qualification, security assessment or full GMP validation.

## 3. Responsibilities

| Role | Responsibility |
|---|---|
| Installer/IT | Execute installation, capture technical evidence and identify deviations. |
| System owner | Confirm intended configuration and operational readiness. |
| QA/Validation | Review evidence, assess deviations and approve/reject IQ. |
| Supplier/support | Provide approved release, installation instructions and technical support. |

## 4. Prerequisites

Confirm before execution:

- approved change control is open;
- approved release/package hash is recorded;
- host and network architecture are approved;
- Docker/container-host approach is approved;
- administrator access is available;
- backup location and retention are approved;
- hostname and stable IP/DNS are approved;
- antivirus/firewall exclusions or approvals are documented where required;
- test accounts and data are available;
- rollback plan is approved.

## 5. Automated IQ evidence

`01 - INSTALL SERVER.bat` executes:

```text
windows\Generate-IQReport.ps1
```

and writes:

```text
deployment-records\ESC-IQ-Execution-Latest.html
```

Attach the generated HTML/printed PDF to this controlled protocol. Failed automated checks require investigation and deviation assessment; they must not be ignored merely because the application appears to open.

## 6. IQ test cases

### IQ-01 — Installation package and path

**Objective:** Verify the approved release is installed in the intended location.

**Procedure:**

1. Record release identifier and package SHA-256.
2. Confirm installation path.
3. Confirm required folders/files exist.
4. Confirm the path is local host storage, not a mapped network share used as live application storage.

**Acceptance:** Release/hash matches approval; required files exist; path is approved.

**Evidence/result:**  
**Result:** PASS / FAIL  
**Executed by/date:**  

### IQ-02 — Host and operating environment

**Objective:** Verify host identity, Windows edition, CPU/RAM/disk, timezone and network identity.

**Procedure:** Record:

```text
Computer name
Windows edition/build
CPU/RAM
System drive free space
Timezone
IPv4 address
Domain/workgroup
```

**Acceptance:** Matches approved specification and minimum capacity.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-03 — Docker and Compose

**Objective:** Verify Docker engine and Compose are available.

**Procedure:** Record:

```bat
docker version
docker compose version
docker info
```

**Acceptance:** Commands complete without error; Linux container mode is available.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-04 — Configuration file protection

**Objective:** Verify `.env` exists and sensitive configuration is not publicly accessible.

**Procedure:**

1. Confirm `.env` exists.
2. Confirm it is not included in the client package.
3. Confirm access is restricted to authorised host administrators.
4. Do not copy secret values into the IQ report.

**Acceptance:** Configuration exists, is protected and secrets are absent from ordinary evidence bundles.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-05 — Database schema initialisation

**Objective:** Verify the database initialiser completed successfully.

**Procedure:** Review `db-init` container status/logs and confirm bootstrap marker version.

```sql
SELECT version, applied_at
FROM deployment_schema_bootstrap
ORDER BY applied_at;
```

Confirm migration 124 objects:

```sql
SELECT to_regclass('public.material_code_seq');
SELECT column_name FROM information_schema.columns
WHERE table_name IN ('consumption_batches','stock_transactions')
AND column_name='customer_name';
```

**Acceptance:** Initialiser exited successfully; expected schema/version objects exist.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-06 — Container state

**Objective:** Verify required services are running/healthy.

**Procedure:** Run `STATUS_WINDOWS.bat` and Docker Compose status.

**Acceptance:** PostgreSQL, API and web are running/healthy; db-init completed successfully.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-07 — HTTP health

**Objective:** Verify diagnostic HTTP routing.

**Procedure:** Open or query:

```text
http://127.0.0.1:8088/api/health
```

**Acceptance:** Returns `{"ok":true,"service":"stock-control"}`.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-08 — HTTPS health

**Objective:** Verify secure web routing.

**Procedure:** Open:

```text
https://stock-control.test:8443/api/health
```

**Acceptance:** Trusted HTTPS connection returns `ok=true` without browser certificate warning.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-09 — Certificate and private-key controls

**Objective:** Verify certificate identity, validity and key segregation.

**Procedure:**

1. Record public CA and server-certificate thumbprints/expiry.
2. Confirm CA is in Local Computer Trusted Root on host.
3. Confirm private keys remain only on server.
4. Confirm client package contains public CA only.

**Acceptance:** Certificates current; trust correct; no private key in client package.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-10 — Hostname and network

**Objective:** Verify hostname resolves and clients can reach the server.

**Procedure:**

```bat
ping stock-control.test
```

From representative client:

```powershell
Test-NetConnection stock-control.test -Port 8443
```

**Acceptance:** Hostname resolves to approved IP and TCP 8443 succeeds.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-11 — Firewall configuration

**Objective:** Verify approved inbound rules.

**Procedure:** Review Windows Firewall rules for Eaststone Stock Control HTTP/HTTPS.

**Acceptance:** Required rules enabled on approved profiles only; public-profile exposure is not enabled without approval.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-12 — Automatic maintenance tasks

**Objective:** Verify Windows maintenance tasks and the configurable backup scheduler exist and are enabled.

**Procedure:** Review Task Scheduler entries:

```text
Eaststone Stock Control - Health Monitor
Eaststone Stock Control - Certificate Renewal
Docker service: backup-scheduler
```

**Acceptance:** Windows tasks exist and use approved paths/account/triggers. The `backup-scheduler` container is running, its state file is readable, and the configured enabled state/time/retention match the approved configuration.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-13 — Initial backup

**Objective:** Verify a post-installation database backup exists.

**Procedure:** Confirm `.dump` and `.dump.json` files; independently calculate SHA-256.

**Acceptance:** Hash matches manifest; backup is non-zero and copied/queued for approved off-host storage.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-14 — Administrator account and permissions

**Objective:** Verify bootstrap access and ADMIN permissions.

**Procedure:**

1. Login as `admin` using controlled initial credential.
2. Confirm access to Admin, Audit, Analytics, edit and database tools.
3. Compare ADMIN permission rows with permission catalogue.

```sql
SELECT COUNT(*) AS missing_admin_permissions
FROM permissions p
LEFT JOIN role_permissions rp
  ON rp.role_name='ADMIN'
 AND rp.permission_key=p.key
 AND rp.granted=TRUE
WHERE rp.permission_key IS NULL;
```

**Acceptance:** Login works; missing count is zero; ADMIN can access all registered features.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-15 — Client deployment package

**Objective:** Verify the generated client package is complete and contains no private key.

**Procedure:** Review `client-deployment`.

**Acceptance:** Contains client installer/config/public CA; no `.key` file; configured hostname/IP are correct.

**Evidence/result:**  
**Result:** PASS / FAIL  

### IQ-16 — Operational controls

**Objective:** Verify start, controlled stop and status functions.

**Procedure:**

1. Run `STOP_WINDOWS.bat`.
2. Confirm services stop and database volume remains.
3. Confirm health monitor respects manual-stop flag.
4. Run `START_WINDOWS.bat`.
5. Confirm health and login return.
6. Run `STATUS_WINDOWS.bat`.

**Acceptance:** Controlled stop/start works without data loss; status is meaningful.

**Evidence/result:**  
**Result:** PASS / FAIL  

## 7. Deviations

| Deviation ID | Test | Description | Impact/risk | Corrective action | Disposition/approval |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## 8. Attachments

- Approved release hash/listing
- Generated IQ execution HTML/PDF
- Docker/version evidence
- Container status/log evidence
- Certificate evidence
- Firewall/task evidence
- Backup and SHA-256 evidence
- Client test evidence
- Deviations and resolutions

## 9. Conclusion

State whether the installation:

- conforms to approved configuration;
- has acceptable deviations;
- is approved to proceed to OQ/PQ/UAT;
- requires remediation/re-execution.

**Conclusion:**  

## 10. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by |  |  |  |
| System owner review |  |  |  |
| QA/Validation approval |  |  |  |
