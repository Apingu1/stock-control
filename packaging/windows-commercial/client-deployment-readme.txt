CLIENT DEPLOYMENT

This folder contains the complete BAT-based client deployment controls.

When the commercial package is first downloaded it contains:

- 01 - INSTALL CLIENT.bat
- 02 - UNINSTALL CLIENT.bat
- Configure-Hosts.ps1
- client-config.ini
- README.txt

Run "01 - INSTALL SERVER.bat" on the server before installing any clients.

The server installation does NOT build or create a client EXE. It finalises this SAME CLIENT DEPLOYMENT folder in place by:

- writing the real server IP/hostname into client-config.ini
- adding stock-control-ca.crt, the public Stock Control CA certificate

After successful server installation this folder must contain:

- 01 - INSTALL CLIENT.bat
- 02 - UNINSTALL CLIENT.bat
- Configure-Hosts.ps1
- client-config.ini
- stock-control-ca.crt
- README.txt

The server installer verifies that SERVER_IP is populated and stock-control-ca.crt exists before it reports the shared CLIENT DEPLOYMENT package as ready.

The folder may remain in the approved Windows shared/network folder. On each client computer, browse to this SAME shared CLIENT DEPLOYMENT folder and run "01 - INSTALL CLIENT.bat" as Administrator. The installer stages the required files locally before UAC elevation, matching the proven working client behaviour.

To remove Stock Control access/configuration from a client computer, run "02 - UNINSTALL CLIENT.bat" as Administrator. Client uninstall removes only that computer's shortcut, hosts mapping, trusted client CA and client registration. It does NOT remove the server, database, stock data or the shared deployment folder.

No client EXE is required or created.
Do not use a CLIENT DEPLOYMENT folder from a different Stock Control server installation.
