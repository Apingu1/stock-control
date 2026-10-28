# StkFlo — High-quality logo and icon exports

Approved design: uploaded `grok_1793131296497.jpg` (1408×1408 pixels). **No logo or typeface redesign.**

## Use these files in the app

- **Full horizontal logo for original composition:** `01_FULL_LOGO/StkFlo_Full_Logo_DarkUI_Transparent.png`
- **Better fit in compact sidebar/header:** `02_COMPACT_LOGO/StkFlo_Compact_DarkUI_Transparent.png`
- **Stacked logo on the left side of login screen:** `03_STACKED_LOGO/StkFlo_Stacked_DarkUI_Transparent.png`
- **SF monogram above login form:** `04_STANDALONE_MONOGRAM/StkFlo_Monogram_Transparent.png`
- **Website / PWA favicon:** `07_BROWSER_AND_PWA/favicon.ico`, plus PNG sizes and web manifest
- **Windows shortcut:** `08_WINDOWS_DESKTOP/StkFlo_Windows_App.ico`

## Quality and transparency

The approved design was supplied as a **JPEG, not a vector master**. Background was carefully isolated using a foreground alpha matte to remove the original navy and heavy cast shadows. Logos have transparent RGBA pixels and are intended to display correctly over navy, slate and white backgrounds. Logo files with `LightUI` use the original SF icon but recolour only the original white `Stk` letters to navy for contrast; `Flo` stays gradient.

Source-sized (1×) exports preserve the actual detail available from the JPEG. 2× and 3× files are high-quality Lanczos resamples for display convenience, **not newly recovered source detail**. Supplied `.svg` files are wrappers containing embedded high-quality PNGs, **not editable vector paths**. For fully scalable print/vector artwork, the logo needs to be redrawn professionally from the approved reference.

## Folders

- `00_APPROVED_SOURCE`: untouched original
- `01_FULL_LOGO`: transparent logo, background previews, enlarged PNGs
- `02_COMPACT_LOGO`: symbol scaled to wordmark height without altering its shape
- `03_STACKED_LOGO`: monogram above the original lettering
- `04_STANDALONE_MONOGRAM`: exact symbol isolated from supplied artwork
- `05_WORDMARK`: wordmark alone
- `06_APP_ICONS`: transparent/dark/light application icon sizes
- `07_BROWSER_AND_PWA`: browser and mobile web assets + manifest
- `08_WINDOWS_DESKTOP`: Windows app and desktop shortcut assets
- `09_SVG_IMAGE_BACKED`: SVG containers, clearly labelled image-backed
- `10_QUALITY_PREVIEWS`: alpha checkerboard, background and size validation

## Transparency vs opaque

Files with `Transparent` have no background. `DarkUI` means white `Stk` text, not an embedded dark backdrop. Browser/app icon tiles deliberately have an opaque background for consistent device display.

## Limitations

Transparent edges are carefully matted and visually QA-checked; subpixel outlines are naturally antialiased. Because the source contains JPEG compression and a faint cast shadow, these are high-quality **faithful image exports**, not mathematically perfect vector equivalents.
