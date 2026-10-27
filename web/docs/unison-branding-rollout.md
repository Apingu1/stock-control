# Unison branding and navigation rollout

## Scope

This branch implements the Unison identity in the **existing Stock Control frontend**, based on `feature/consumption-packaging-lines`. No stock calculations, API routes, role permissions, database schema, manufacturing history, or existing navigation destinations are intentionally changed.

The approved identity assets are supplied from the Unison Complete Brand Identity package:
- `web/public/branding/unison-horizontal-light.webp`: the approved horizontal light-on-dark wordmark, optimised for web delivery with transparency.
- `web/public/icons/unison-192.webp`: the approved original 3D Unison app icon.
- `web/public/icons/unison-192.png`: PNG rendition of the supplied app icon for Chromium browser shortcuts and app metadata.
- `web/public/branding/unison-logo-light.svg`, `unison-monogram.svg`, `web/public/icons/unison.svg`, `unison-maskable.svg`: lightweight SVG presentation and fallback assets.

The new `web/src/unison.css` layer is deliberately imported after the previous application styles. This isolates the rebrand and avoids rewriting unrelated page layouts.

## UI behaviour

1. The sign-in screen uses Unison artwork, a two-column desktop layout and a compact mobile layout. Existing login, login errors, idle-logout messages, and mandatory first-password-change flows remain connected to the same backend APIs.
2. Unison branding appears in the primary sidebar and at the top of every authenticated view through `TopBar.tsx`.
3. Sidebar items, order, admin/permissions checks and the Low Stock & Expiry count are unchanged. Icons, spacing, active styling, user footer and collapse behaviour are refreshed based on Training Matrix patterns.
4. On desktop the menu can be fully hidden, and a floating menu button restores it. The choice persists per browser under `unison-sidebar-collapsed`. On narrow screens it appears as a dismissible navigation drawer.
5. The page title, manifest, favicon, PWA update prompt, offline page and service-worker pre-cache use Unison. PWA requests for operational data remain network-only; this work does **not** introduce offline editing or transactions.

## Manual acceptance checklist

- [ ] Sign in with each test role; confirm stock views and permissions behave exactly as before.
- [ ] Test wrong password, successful password, password visibility toggle, and forced first-time password change.
- [ ] Collapse and reopen the desktop sidebar; refresh and verify the choice is remembered.
- [ ] Resize to mobile width; verify drawer open/close via menu, overlay, navigation selection and Escape key.
- [ ] Verify dashboard, Products, Analytics, Materials, Receipts, Consumption, Lots, Quarantine, Alerts, Audit and Admin links.
- [ ] Check sidebar alert counts and signed-in username; verify logout.
- [ ] On Chrome, use **Install Unison** (when available) or **More tools → Create shortcut**; verify Unison name and icon, including on a fresh browser profile.
- [ ] Test offline network loss: Unison notice only, no offline write operations.
- [ ] Validate web build with `cd web && npm ci && npm run build` and perform browser visual review.

## Deployment considerations

After deployment, force-refresh existing clients and accept the Unison app update. Browsers might retain an earlier shortcut title/icon until they update or reinstall their shortcut. The manifest's stable app ID `/` is preserved so existing installed application identities are not needlessly replaced.

This is a user-interface rebrand, **not** evidence of GMP computerised-system validation. Conduct normal review and environment-appropriate change control before a regulated production rollout.
