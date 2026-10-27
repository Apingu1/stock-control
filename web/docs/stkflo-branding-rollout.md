# StkFlo branding rollout (from `feature/unison-branding-navigation`)

## Scope

The StkFlo identity replaces the previous Unison brand while keeping all stock-control
business rules, authentication, permissions, navigation, slogans and GMP workflows intact.
The two-panel sign-in keeps the **approved StkFlo white-lettered horizontal lockup on the
left** and **independent 3D SF monogram above the sign-in form on the right**.

Existing slogans remain unchanged:
- **ONE PLATFORM. GREATER CONTROL.**
- **Clarity across every movement.**
- **CONNECTED OPERATIONS**

Login errors, temporary-password reset, password visibility, session expiry and logout
remain connected to the existing APIs. The signed-in sidebar and topbar also use StkFlo.

## Exact artwork (one-time installation)

The uploaded `StkFlo_COMPLETE_Logo_and_Branding_Package.zip` contains binary-backed SVGs
and PNG/ICO icon artwork; they **cannot be reproduced correctly with text-only changes**.
This repository contains a hash-verified installer; run it in your Codespace to place the
actual, unmodified artwork into the new branch.

1. In GitHub Codespaces, open the `feature/stkflo-rebrand` branch:
   ```bash
   cd /workspaces/stock-control
   git fetch origin
   git switch feature/stkflo-rebrand
   git pull origin feature/stkflo-rebrand
   ```
2. Upload the **same** StkFlo branding ZIP into `/workspaces/stock-control`.
3. Install, commit, and push the original image files (no host Python required):
   ```bash
   bash scripts/install_stkflo_branding.sh \
     "/workspaces/stock-control/StkFlo_COMPLETE_Logo_and_Branding_Package.zip" --push
   ```
   If the uploaded ZIP has a different filename (e.g. ` (1)`), supply that exact path.
   You may omit `--push` to inspect the extracted assets before committing.

The script cryptographically verifies **all eight** exact files before modifying assets:

| Destination | Approved asset |
|---|---|
| `web/public/branding/stkflo-horizontal.svg` | Horizontal WhiteStk original 3D raster-backed SVG |
| `web/public/branding/stkflo-monogram.svg` | Independent SF 3D monogram raster-backed SVG |
| `web/public/icons/stkflo-32.png` | Browser favicon PNG |
| `web/public/icons/stkflo-192.png` | Chromium and PWA icon |
| `web/public/icons/stkflo-512.png` | Large PWA icon |
| `web/public/icons/stkflo-maskable-512.png` | Android adaptive icon |
| `web/public/icons/stkflo-apple-touch.png` | Apple home-screen icon |
| `web/public/icons/stkflo-favicon.ico` | Windows / browser tab favicon |

Icons contain **only the StkFlo monogram**, not the StkFlo wordmark.

## Browser and installed shortcut identity

- Browser title, HTML application metadata and Apple app title say `StkFlo`.
- Web app manifest keeps stable `id: "/"`, now advertises StkFlo and approved icons.
- Service worker uses a new StkFlo cache version and precaches the new assets.
- Offline notice, update prompt, top bar icon, sidebar and login mention StkFlo.
- No offline posting of GMP transactions is enabled or changed.

After deployment, refresh the app and accept the update prompt. Existing Chrome/Edge
Windows shortcuts may keep their old title or icon due to OS / Chromium caching;
**remove and reinstall an old shortcut** if it doesn't update. New shortcuts will use
the StkFlo monogram after the assets are installed and a production build is served.

## Validation / acceptance

- [ ] Full StkFlo logo (white `Stk`) is visible **left** above the slogans, not cropped.
- [ ] Approved 3D SF monogram sits above **Welcome back** on the **right**, no square background.
- [ ] Sidebar and top bar carry StkFlo correctly in collapsed and expanded navigation.
- [ ] Existing slogans, navigation, role-gated actions and live metrics are unchanged.
- [ ] Username/password, mandatory change, invalid password, logout, timeout all work.
- [ ] Confirm `/manifest.webmanifest`, `/icons/stkflo-192.png`, `/icons/stkflo-favicon.ico`
      and both `/branding/stkflo-*.svg` return HTTP 200.
- [ ] `cd web && npm ci && npm run build`
- [ ] Chrome / Edge install app uses name **StkFlo** and monogram-only icon.
- [ ] Verify service worker upgrade, offline notice, and no offline GMP transactions.

**Important:** GitHub source updates are in place, but install the ZIP assets before
building/deploying the frontend. Until installed, the new image URLs will 404 and the
service-worker precache install will fail.
