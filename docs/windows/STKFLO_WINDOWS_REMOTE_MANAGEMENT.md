# StkFlo Windows installation and independent recovery

**Status: feature branch. Windows/Hyper-V acceptance testing is REQUIRED before production release.**

## Overview

The physical Hyper-V host retains its existing networking and automatic VM startup settings. The Windows 11 guest retains Docker Desktop under its existing dedicated auto-login account. StkFlo and PostgreSQL run in Docker on the VM. The **Host Manager** is a Windows startup task on the physical host; the **VM Manager** is a separate Windows startup task on the guest. Neither management agent runs inside Docker.

The shared N: drive distributes the installation and client package. The installer stages files locally *before* UAC elevation, preventing mapped-share access loss during installation. PostgreSQL stays on a local Docker volume, not N:.

## Build the release

On a Windows development/build machine, run BUILD_COMMERCIAL_PACKAGE.bat. The output is release\StkFlo and StkFlo-Windows-Installation.zip. The ZIP contains:

- 01 - INSTALL SERVER.bat
- 02 - START SERVER.bat, 03 - STOP SERVER.bat, 04 - SERVER STATUS.bat
- CLIENT DEPLOYMENT (client installer, uninstaller, public CA placeholder)
- Administration & Recovery\03 - ENABLE VM MANAGEMENT.bat
- HOST MANAGEMENT\01 - INSTALL HOST MANAGER.bat
- System (server runtime; never installed on client PCs)

Distribute a controlled release copy to the N: share. Ordinary staff should have read-only access to the installation package.

## Server installation on Windows 11 VM

1. Confirm Docker Desktop is running under the existing dedicated auto-login Windows account. Do not change the stable VM/host IP configuration.
2. From the shared N: folder, double-click 01 - INSTALL SERVER.bat. Do not manually copy it to the desktop first.
3. The launcher stages the complete package locally *before* UAC elevation. It installs to C:\ProgramData\StkFlo\Server, builds the stack, provisions HTTPS and copies the finished client package back to the original network share.
4. Record the unique one-time administrator password shown at installation, sign in as admin, and change it at first login. No fixed initial password is used.
5. Map the internal hostname stkflo to the VM address using approved DNS or client hosts configuration. Trust the public StkFlo CA. The canonical address is https://stkflo/ (HTTPS 443). Cleartext HTTP on 8088 is VM-loopback-only.
6. Test application login, database, backups, health, certificates and scheduled maintenance before distributing clients.

## Client installation from N:

After the server installer confirms that CLIENT DEPLOYMENT has been updated, browse to the same N: release directory from a workstation and double-click CLIENT DEPLOYMENT\01 - INSTALL CLIENT.bat. The installer stages itself locally whether or not the user initially launches it as Administrator, then elevates, installs the public CA, configures hostname resolution and creates a **public desktop/common Start-menu** StkFlo shortcut.

No Python or Docker is required on staff computers. Never distribute private HTTPS/CA keys.

## Install the Host Manager once, on the physical host

On the Hyper-V host open HOST MANAGEMENT\01 - INSTALL HOST MANAGER.bat. It stages itself before elevation and asks for:

- The real Hyper-V VM name (for example east-dev1).
- The approved Windows domain/local administrator account to authorise.
- The permitted administration subnet in CIDR notation.

The installer adds the nominated account to a local StkFlo Managers group, creates a non-exportable HTTPS certificate, limits its Windows Firewall rule to the approved subnet, and registers an automatic SYSTEM startup task. No Docker is installed on the host.

Map stkflo-host to the **physical host** network address in approved DNS/hosts. Verify the distributed public certificate from C:\ProgramData\StkFlo\HostManagement, trust it on the authorised administrator PC, and open https://stkflo-host:9443/.

The independent Host Manager supports VM status, start and graceful shutdown. Force restart is disabled by default. It continues operating if the Windows VM is powered off.

## Install the VM Manager once, inside the Windows VM

Open Administration & Recovery\03 - ENABLE VM MANAGEMENT.bat. It asks for:

- The exact Windows user who normally runs Docker Desktop (e.g. VMNAME\username).
- An authorised Windows identity for remote management.
- The approved admin subnet.
- The underlying approved UNC share for the existing N: drive (e.g. \\server\share).

The installer registers an independent SYSTEM management task, three on-demand Docker control tasks using the interactive Docker user account, and a 15-minute network backup replication task. Map stkflo-manager to the VM's existing network address. Verify and trust the public certificate from C:\ProgramData\StkFlo\Management on authorised admin workstations, then open https://stkflo-manager:9444/.

Both manager endpoints require HTTPS, Windows Integrated Authentication and membership in their local StkFlo Managers group. A browser may prompt for Windows credentials. Do not grant the group to general staff. Every requested management action requires a reason and is audit-logged.

When StkFlo itself is healthy, enable its existing Admin maintenance mode before requesting a disruptive Stop or Restart. If the API is already down, emergency recovery remains permitted.

A queued Docker operation is NOT the same as a successful restart. Verify the manager's latest-action status and health after submitting it. The Docker control tasks only work with the dedicated Docker user logged in; leave the proven auto-login mechanism in place.

## Local-first network backups and cloud coverage

The main StkFlo backup engine produces PostgreSQL custom-format dumps plus SHA-256 manifests in C:\ProgramData\StkFlo\Server\Backups. The independent VM replication task copies and verifies these files to the approved UNC share already covered by your external cloud backup process. The source share is configured through the VM Manager; destinations outside the IT-approved UNC root are rejected.

Use the underlying \\server\share path, **not N:**, for scheduled copying. Run NET USE N: on a computer with the drive mapped to find the actual share. Ensure the chosen Docker/SMB Windows account can write to the share without relying on the N: mapped-drive letter.

Network outages do not block creation of local verified backups; the next replication task retries. Replication results appear in StkFlo Admin > Database Backup & Recovery. That page continues to control automatic backup time and retention; the VM Manager controls the network replication destination.

External share files are not automatically pruned when local backups expire. Apply an appropriate existing external retention policy, monitor available storage, and periodically perform actual restoration tests.

## Recovery matrix

| Fault | Recovery |
| --- | --- |
| StkFlo container or API stops | VM Manager, Start StkFlo |
| Docker Desktop stops | VM Manager queues the approved Docker-user health-monitor task |
| Deliberate stop | No automatic recovery until authorised start clears the stop flag |
| Windows VM off | Host Manager, Start Windows VM |
| VM frozen / unresponsive | Escalate to Hyper-V IT; forced reset is off by default |
| Physical host powered off | External hardware, IT or out-of-band recovery is required |

## Required acceptance checks

1. Server install directly from N: with UAC elevation (including a different administrator account); verify correct stage, completed local installation and client publication to N:.
2. Client install directly from N:; confirm trusted HTTPS, individual user login and common desktop shortcut.
3. From a second workstation verify https://stkflo/ and that port 8088 is not externally exposed.
4. Trigger controlled stop/start via VM Manager; verify health changes, audit logs and preserved PostgreSQL data.
5. Stop Docker Desktop in a test session; queue recovery and verify completion, not just acceptance.
6. Shut down and restart the Windows VM using the independent physical-host agent.
7. Test daily/manual local backups, manifests, UNC replication, disconnect/reconnect recovery and cloud-copy coverage.
8. Restore a real test backup and confirm recovered records.
9. Test unauthorised access to both manager endpoints, HTTPS trust and anti-CSRF protections.
10. Complete formal change control, IQ/OQ/PQ and Windows/Hyper-V-specific installation qualification.

Passing source checks or an automated package build does not substitute for real Windows, Hyper-V, Docker Desktop and SMB testing.


## Recovering from an interrupted first server setup (initial administrator)

The database schema deliberately seeds an administrator row with a placeholder hash.
Fresh installations now recognise only that exact placeholder and provision the
one-time password. Real administrator credentials are never overwritten by an
ordinary reinstall or upgrade.

If an older package stopped with `Bootstrap administrator 'admin': UNCHANGED`
followed by an HTTP 401 login check, **do not remove Docker volumes or reinstall
PostgreSQL**. The PostgreSQL/API/web containers may already be healthy. On the
**Windows VM**, with an administrator-approved recovery action:

1. Open an **elevated Command Prompt**.
2. Run `cd /d "C:\ProgramData\StkFlo\Server"`.
3. Run `RESET_ADMIN_PASSWORD_WINDOWS.bat`, and record the one-time recovery
   password securely **only if the script reports that its login test passed**.
   This deliberately changes the `admin` password; use it only with authority.
4. If using the older installed reset script (which doesn't automatically mark
   verified recovery), run:
   `if not exist "deployment" mkdir "deployment"`
   and then `echo Administrator recovery verified > "deployment\admin-bootstrap-complete.flag"`.
5. Resume remaining setup with
   `call "ESC_SERVER_SETUP_WINDOWS.bat" stkflo 192.168.1.153` **only if**
   `192.168.1.153` is the VM's current confirmed LAN address; otherwise supply
   its actual address. The script completes HTTPS, trusted CA, firewall, backup,
   Windows maintenance tasks, and IQ checks without recreating the database.
6. Review `deployment-records\StkFlo-IQ-Execution-Latest.html` and check
   `https://stkflo/`. Re-distribute the final `client-deployment` folder or
   rerun the commercial release entrypoint to publish its client files.

The earlier `stkflo-api` pull error may be nonfatal if the Docker build
subsequently succeeds. The installation now builds local images first to avoid
that misleading output.
