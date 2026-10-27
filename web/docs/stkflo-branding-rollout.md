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
| Full horizontal identity (asset retained; left login now uses animation) | `09_SVG_IMAGE_BACKED/StkFlo_Full_Logo_DarkUI_Raster_Embedded.svg` | `web/public/branding/stkflo-horizontal.svg` |
| Authenticated sidebar compact identity | `09_SVG_IMAGE_BACKED/StkFlo_Compact_DarkUI_Raster_Embedded.svg` | `web/public/branding/stkflo-compact.svg` |
| Login right, independent SF icon | `09_SVG_IMAGE_BACKED/StkFlo_Monogram_Raster_Embedded.svg` | `web/public/branding/stkflo-monogram.svg` |
| Browser tab | `07_BROWSER_AND_PWA/favicon-32x32.png` | `web/public/icons/stkflo-32.png` |
| Chrome / Edge PWA | `07_BROWSER_AND_PWA/android-chrome-192x192.png` | `web/public/icons/stkflo-192.png` |
| High-density desktop/PWA | `07_BROWSER_AND_PWA/android-chrome-512x512.png` | `web/public/icons/stkflo-512.png` |
| Android maskable | `07_BROWSER_AND_PWA/maskable-icon-512x512.png` | `web/public/icons/stkflo-maskable-512.png` |
| iPhone/iPad home screen | `07_BROWSER_AND_PWA/apple-touch-icon.png` | `web/public/icons/stkflo-apple-touch.png` |
| Windows/browser ICO | `07_BROWSER_AND_PWA/favicon.ico` | `web/public/icons/stkflo-favicon.ico` |

The two-column login layout is preserved. The left-hand panel now places the square looping StkFlo video high in the panel, with the restored original slogans beneath it: CONNECTED OPERATIONS, Clarity across every movement., A unified workspace for materials, traceability and confident inventory control., and ONE PLATFORM. GREATER CONTROL. The right-hand sign-in panel retains the SF monogram and SECURE ACCESS label, without Welcome back. Authentication, password change, RBAC, on-prem server and GMP transactions are unchanged.

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

# Use your already extracted video folder:
bash scripts/install_stkflo_login_video.sh "/workspaces/stock-control/StkFlo_Login_Video_Pack" --push

cd web
npm ci
npm run build
```

No host Python, Docker or `unzip` is needed for an extracted folder.
The installer verifies the SHA-256 of all nine approved files before copying,
commits ONLY those assets, and pushes to the **StkFlo branch**.
The frontend `prebuild` hook checks the nine approved brand assets AND both video and poster SHA-256 hashes. If unzip is unavailable, extract the video ZIP and pass that extracted folder to the installer.

### Acceptance checks

- [ ] Animated StkFlo logo sits towards the top of the left-hand panel with no stretching or cropping
- [ ] The original headline, supporting line and slogan are visible beneath the film, including on mobile
- [ ] Video autoplays silently, loops, and shows a static poster when unavailable or motion is reduced
- [ ] The Welcome back heading has been removed
- [ ] Independent 3D SF monogram above login fields on the right
- [ ] Authentication works as before, with the login layout and restored slogan copy
- [ ] Compact StkFlo image in sidebar and monogram in top bar
- [ ] `npm run build` passes after installer and `web/public/branding` assets load
- [ ] Favicon, Chrome/Edge install icon, Android and Apple icons have SF monogram only
- [ ] Browser title and PWA installed app name display StkFlo
- [ ] Existing PWA install may need reinstalling to clear Windows/Chrome icon caches
- [ ] Test wrong password, forced change, successful login, logout, and permissions
- [ ] Check service worker update and that stock activity remains network-only

**Deployment caution:** do not deploy before running BOTH the branding and login-video installers. The GitHub
source references the premium assets, but binaries must first be installed and
committed from your Codespaces folder. Existing clients may cache older shortcut
icons until the PWA or shortcut is removed/reinstalled.
