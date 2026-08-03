# Stock Control production deployment test

This branch provides an isolated Docker production-test deployment for the
installable Eaststone Stock Control PWA.

It builds the React/TypeScript frontend into an immutable Nginx image and serves
the frontend and FastAPI backend from one origin:

- `/` — compiled React PWA
- `/manifest.webmanifest` — PWA manifest
- `/sw.js` — service worker
- `/api/*` — reverse-proxied FastAPI routes

The normal development Compose file and `restart_stack.sh` are unchanged.

## Isolation

The production test uses:

- Compose project: `stock-control-prodtest`
- Database volume: `stock-control-prodtest-db-data`
- Backups folder: `backups-production-test`
- HTTP port: `8088` by default
- HTTPS port: `8443` by default

It does not use or delete the existing development database volume.

## Server prerequisites

Install:

- Git
- Docker Engine
- Docker Compose v2
- OpenSSL, for the HTTPS/PWA installation test
- curl, for deployment health checks

The server and operator computers must be able to reach each other over the
internal network. Allow the chosen application port through the server firewall.

## 1. Clone and select the branch

```bash
git clone https://github.com/Apingu1/stock-control.git
cd stock-control
git switch feature/pwa-production-deployment-test
```

For an existing clone:

```bash
git fetch origin
git switch feature/pwa-production-deployment-test
git pull --ff-only origin feature/pwa-production-deployment-test
```

## 2. Create the environment file

```bash
cp .env.example .env
```

Edit `.env` and replace at least:

```text
DB_PASSWORD=<strong test password>
JWT_SECRET=<long random secret>
APP_HTTP_PORT=8088
APP_HTTPS_PORT=8443
```

Generate a JWT secret on Linux:

```bash
openssl rand -hex 48
```

Do not commit `.env`.

## 3. HTTP smoke test

```bash
chmod +x scripts/production_test_*.sh scripts/generate_test_tls_cert.sh
./scripts/production_test_up.sh
```

Test on the server:

```bash
curl http://localhost:8088/api/health
curl http://localhost:8088/manifest.webmanifest
```

Open from another computer:

```text
http://<SERVER_IP>:8088
```

This verifies the Docker deployment, login, API routing and multi-user access.
Browsers normally require HTTPS for service-worker/PWA installation on a remote
computer, so complete the TLS steps below before testing installation.

## 4. Choose a stable internal hostname

Use your internal DNS where available, for example:

```text
stock-control.company.local
```

For a temporary test without internal DNS, use:

```text
stock-control.test
```

and add the following line to each Windows test computer's hosts file as an
administrator:

```text
<SERVER_IP> stock-control.test
```

Windows hosts file:

```text
C:\Windows\System32\drivers\etc\hosts
```

## 5. Generate the test TLS certificate

On the server:

```bash
./scripts/generate_test_tls_cert.sh stock-control.test <SERVER_IP>
```

This creates a private test CA and a server certificate under `infra/certs`.
The private keys must remain on the server.

## 6. Trust the test CA on each Windows test computer

Copy only this file to each test PC:

```text
infra/certs/stock-control-ca.crt
```

Import it into:

```text
Local Computer
└── Trusted Root Certification Authorities
```

Using the Microsoft Management Console:

1. Run `mmc`.
2. Add the **Certificates** snap-in.
3. Select **Computer account**.
4. Import `stock-control-ca.crt` into **Trusted Root Certification Authorities**.
5. Close and reopen Chrome.

Do not copy the CA private key or server private key to operator computers.

## 7. Start the HTTPS production test

```bash
./scripts/production_test_up_tls.sh
```

Open from a trusted operator PC:

```text
https://stock-control.test:8443
```

Chrome should now be able to load the manifest, register the service worker and
offer **Install Eaststone Stock Control**.

## 8. Verification

On the server:

```bash
./scripts/production_test_status.sh
docker compose -f infra/docker-compose.production.yml --env-file .env logs -f
```

In Chrome:

```text
F12
└── Application
    ├── Manifest
    ├── Service Workers
    └── Storage
```

Confirm:

- the application name is Eaststone Stock Control;
- the four icons load;
- the service worker is activated;
- `/api/health` returns successfully;
- separate computers retain separate login sessions;
- one user's login does not replace another user's session;
- receipts and issues require a live server connection;
- stopping the stack shows the controlled offline page rather than allowing an
  offline transaction.

## 9. Stop without deleting data

```bash
./scripts/production_test_down.sh
```

This preserves the production-test database volume.

Never add `-v` unless the production-test database is intentionally being
destroyed.

## Update the test deployment

```bash
git fetch origin
git pull --ff-only
./scripts/production_test_up_tls.sh
```

Docker rebuilds the frontend and API images and retains the database volume.

## Current packaging status

This is a production-like deployment test, not the final source-free release
package. The repository is cloned onto the test server so Docker can build the
images.

After the deployment is approved, the next release step is to build versioned
Docker images in a controlled build environment, export or publish those images,
and deploy only the images plus approved Compose/configuration files to the
production server.
