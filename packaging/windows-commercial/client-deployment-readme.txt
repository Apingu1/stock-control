CLIENT DEPLOYMENT

This folder contains the complete BAT-based client deployment controls.

When the commercial package is first downloaded it contains:

- 01 - INSTALL CLIENT.bat
- 02 - UNINSTALL CLIENT.bat
- Configure-Hosts.ps1
- client-config.ini
- README.txt

Run "01 - INSTALL SERVER.bat" on the server before installing any clients.

The server installation does NOT build or create a client EXE. The elevated VM
setup first writes the actual server IP and public CA in
C:\ProgramData\StkFlo\Server\client-deployment. The original network installer
then returns automatically and publishes them to the SAME network folder
from which 01 - INSTALL SERVER.bat was launched, under the original
unelevated account (so N: remains accessible). Do not close the original
install window before it reports that server installation AND original
share publication are complete.

It finalises this SAME CLIENT DEPLOYMENT folder in place by:

- writing the real server IP/hostname into client-config.ini
- adding stock-control-ca.crt, the public Stock Control CA certificate

If the client CA or SERVER_IP is absent after server installation, run the parent
05 - PUBLISH CLIENT DEPLOYMENT.bat ON THE WINDOWS VM under your normal account
with access to the approved network share. This republishes ONLY the public CA
and validated connection settings from the installed server. No server
reinstall, Docker restart or database reset is needed.

A successful publication writes STKFLO_CLIENT_DEPLOYMENT_READY.txt and checks
that the published public CA matches the server public CA and that the
published settings match the server. Do not distribute the client template
until it is ready. NEVER copy a CA/private-key .key file to this folder.

After successful server installation this folder must contain:

- 01 - INSTALL CLIENT.bat
- 02 - UNINSTALL CLIENT.bat
- Configure-Hosts.ps1
- client-config.ini
- stock-control-ca.crt
- STKFLO_CLIENT_DEPLOYMENT_READY.txt
- README.txt

The server installer verifies that SERVER_IP is populated and stock-control-ca.crt exists before it reports the shared CLIENT DEPLOYMENT package as ready.

The folder may remain in the approved Windows shared/network folder. On each client computer, browse to this SAME shared CLIENT DEPLOYMENT folder and run "01 - INSTALL CLIENT.bat" as Administrator. The installer stages the required files locally before UAC elevation, matching the proven working client behaviour.

To remove Stock Control access/configuration from a client computer, run "02 - UNINSTALL CLIENT.bat" as Administrator. Client uninstall removes only that computer's shortcut, hosts mapping, trusted client CA and client registration. It does NOT remove the server, database, stock data or the shared deployment folder.

No client EXE is required or created.
Do not use a CLIENT DEPLOYMENT folder from a different Stock Control server installation.
