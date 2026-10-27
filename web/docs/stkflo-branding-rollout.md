# StkFlo premium rebrand deployment

## Approved high-quality source (27 October 2026)

Use the regenerated **StkFlo_High_Quality_Complete_Logo_Icon_Pack** supplied with this project.
The regenerated pack replaces the earlier `StkFlo_COMPLETE_Logo_and_Branding_Package.zip`
and `StkFlo_Web_Artwork_Only.zip`; DO NOT use those earlier exports.

The original approved identity is preserved: 3D blue-violet **SF** monogram and
white **Stk** / gradient **Flo** wordmark on the dark application.
The SVG assets in the new pack contain embedded raster artwork (not editable vectors).

| UI placement | Source in regenerated pack | Installed name |
| --- | --- | --- |
| Login left, full identity | `09_SVG_IMAGE_BACKED/StkFlo_Full_Logo_DarkUI_Raster_Embedded.svg` | `web/public/branding/stkflo-horizontal.svg` |
| Authenticated sidebar compact identity | `09_SVG_IMAGE_BACKED/StkFlo_Compact_DarkUI_Raster_Embedded.svg` | `web/public/branding/stkflo-compact.svg` |
| Login right, independent SF icon | `09_SVG_IMAGE_BACKED/StkFlo_Monogram_Raster_Embedded.svg` | `web/public/branding/stkflo-monogram.svg` |
| Browser tab | `07_BROWSER_AND_PWA/favicon-32x32.png` | `web/public/icons/stkflo-32.png` |
| Chrome / Edge PWA | `07_BROWSER_AND_PWA/android-chrome-192x192.png` | `web/public/icons/stkflo-192.png` |
| High-density desktop/PWA | `07_BROWSER_AND_PWA/android-chrome-512x512.png` | `web/public/icons/stkflo-512.png` |
| Android maskable | `07_BROWSER_AND_PWA/maskable-icon-512x512.png` | `web/public/icons/stkflo-maskable-512.png` |
| iPhone/iPad home screen | `07_BROWSER_AND_PWA/apple-touch-icon.png` | `web/public/icons/stkflo-apple-touch.png` |
| Windows/browser ICO | `07_BROWSER_AND_PWA/favicon.ico` | `web/public/icons/stkflo-favicon.ico` |

The original two-column login layout and slogans remain in place, including
**ONE PLATFORM. GREATER CONTROL.** and **Clarity across every movement.**
The sign-in API, password change, RBAC, on-prem server, and GMP transaction
processing are unchanged.

## Codespaces: complete the artwork installation

Your extracted folder is expected at:

```text
/workspaces/stock-control/StkFlo_High_Quality_Complete_Logo_Icon_Pack
```

The installer searches recursively for the files from the premium pack, so it
works if extraction created an additional `StkFlo_Premium_Logo_Icon_Pack` directory.

Copy these commands as a block into your Codespaces terminal:

```bash
cd /workspaces/stock-control
git fetch origin
git switch feature/stkflo-rebrand
git pull --ff-only origin feature/stkflo-rebrand

bash scripts/install_stkflo_branding.sh \
  "/workspaces/stock-control/StkFlo_High_Quality_Complete_Logo_Icon_Pack" --push

cd web
npm ci
npm run build
```

No host Python, Docker or `unzip` is needed for an extracted folder.
The installer verifies the SHA-256 of all nine approved files before copying,
commits ONLY those assets, and pushes to the **StkFlo branch**.
The frontend `prebuild` hook checks those same hashes to fail fast if any
image is missing or not the approved version.

### Acceptance checks

- [ ] Full StkFlo dark-UI horizontal logo on the left of login, with white Stk letters
- [ ] Independent 3D SF monogram above login fields on the right
- [ ] All original slogans and original sign-in behaviour are unchanged
- [ ] Compact StkFlo image in sidebar and monogram in top bar
- [ ] `npm run build` passes after installer and `web/public/branding` assets load
- [ ] Favicon, Chrome/Edge install icon, Android and Apple icons have SF monogram only
- [ ] Browser title and PWA installed app name display StkFlo
- [ ] Existing PWA install may need reinstalling to clear Windows/Chrome icon caches
- [ ] Test wrong password, forced change, successful login, logout, and permissions
- [ ] Check service worker update and that stock activity remains network-only

**Deployment caution:** do not deploy before running the installer. The GitHub
source references the premium assets, but binaries must first be installed and
committed from your Codespaces folder. Existing clients may cache older shortcut
icons until the PWA or shortcut is removed/reinstalled.
