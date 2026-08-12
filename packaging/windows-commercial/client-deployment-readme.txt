CLIENT DEPLOYMENT

The BAT-based client setup is already included in this folder when the commercial package is downloaded.

Before the server is installed, this folder contains:

- 01 - INSTALL CLIENT.bat
- Configure-Hosts.ps1
- client-config.ini
- README.txt

Do NOT run the client installer yet. The server-specific IP address and trusted public CA certificate do not exist until the server installation is completed.

Run "01 - INSTALL SERVER.bat" on the server first.

The server installation does NOT build or create a client EXE. It only updates this existing CLIENT DEPLOYMENT folder by:

- writing the real server IP/hostname into client-config.ini
- adding stock-control-ca.crt, the public Stock Control CA certificate

After the server installation, the folder is ready to distribute and should contain:

- 01 - INSTALL CLIENT.bat
- Configure-Hosts.ps1
- client-config.ini
- stock-control-ca.crt
- README.txt

Copy the COMPLETE CLIENT DEPLOYMENT folder to each Windows client computer and run "01 - INSTALL CLIENT.bat" as Administrator.

No client EXE is required or created.
Do not use a client deployment folder from a different Stock Control server installation.
