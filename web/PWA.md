# Eaststone Stock Control PWA

The operator-facing React application is configured as an installable Progressive Web App (PWA).
The backend, database and business logic remain centrally hosted on the shared server.

## Production behaviour

- The app can be installed from Microsoft Edge or Google Chrome and launched from the Windows Start menu, desktop or taskbar.
- The installed app opens in a standalone window.
- Live stock data, authentication and transactions are never cached by the service worker.
- When the central server cannot be reached, the service worker shows a controlled offline notice instead of allowing offline stock processing.
- A waiting frontend release is presented to the operator as an update notification. The operator can save current work before selecting **Update now**.

## Local testing

Normal `npm run dev` sessions do not register the service worker, which prevents stale development caches.

Test the production PWA with:

```bash
cd web
npm run build
npm run preview -- --host 0.0.0.0
```

Alternatively, service-worker registration can be enabled during Vite development for a dedicated test session:

```bash
VITE_ENABLE_PWA_DEV=true npm run dev
```

Use an HTTPS origin or localhost. In Edge or Chrome, open the browser's application tools to inspect the manifest, service worker, installability and storage.

## GMP design restriction

The PWA is installable, but it is not an offline transaction application. Receipts, issues, consumption, quarantine changes and all other controlled stock activity require a live connection to the validated central server.
