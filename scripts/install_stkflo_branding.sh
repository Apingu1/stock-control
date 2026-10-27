#!/usr/bin/env bash
# Install the exact approved StkFlo high-quality artwork from an EXTRACTED FOLDER
# (or ZIP), without requiring Python or Docker.
#
# Usage:
#   bash scripts/install_stkflo_branding.sh "/workspaces/stock-control/StkFlo_High_Quality_Complete_Logo_Icon_Pack" --push
#
# All artwork is verified against the approved regenerated pack (October 2026).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${1:-$ROOT/StkFlo_High_Quality_Complete_Logo_Icon_Pack}"
ACTION="${2:-}"
BRANCH="feature/stkflo-rebrand"
if [[ "$ACTION" != "" && "$ACTION" != "--push" ]]; then
  echo "ERROR: Unrecognised option: $ACTION (expected --push)." >&2; exit 1
fi
if [[ ! -d "$SOURCE" && ! -f "$SOURCE" ]]; then
  echo "ERROR: Artwork folder or ZIP does not exist: $SOURCE" >&2; exit 1
fi
if [[ -f "$SOURCE" ]] && ! command -v unzip >/dev/null 2>&1; then
  echo "ERROR: ZIP requires unzip; extract the ZIP into a folder and pass that path instead." >&2
  exit 1
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  echo "ERROR: sha256sum is needed to verify the approved artwork." >&2; exit 1
fi
if [[ "$ACTION" == "--push" ]]; then
  current="$(git -C "$ROOT" branch --show-current)"
  if [[ "$current" != "$BRANCH" ]]; then
    echo "ERROR: Switch to $BRANCH before --push; current branch: $current" >&2; exit 1
  fi
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
NAMES=()
DESTS=()
HASHES=()

# Format: relative path within extracted premium pack | public asset destination | sha256.
while IFS='|' read -r relative dest expected; do
  [[ -n "$relative" ]] || continue
  NAMES+=("$relative"); DESTS+=("$dest"); HASHES+=("$expected")
done <<'APPROVED_ASSETS'
09_SVG_IMAGE_BACKED/StkFlo_Full_Logo_DarkUI_Raster_Embedded.svg|branding/stkflo-horizontal.svg|eae79cd0ebd72742eea34186557113ba91903b2cd95adf942fb3b4aa13965c2e
09_SVG_IMAGE_BACKED/StkFlo_Compact_DarkUI_Raster_Embedded.svg|branding/stkflo-compact.svg|eedaa30689013da22695355920798fa25f30c2745987a5eaba1552eed42c1938
09_SVG_IMAGE_BACKED/StkFlo_Monogram_Raster_Embedded.svg|branding/stkflo-monogram.svg|624dc863e2b417a8bd84d59b6c6b223d3c4ca83b55ea1555f084721b87e49af5
07_BROWSER_AND_PWA/favicon-32x32.png|icons/stkflo-32.png|4bc2fbc884b55c5beaf3c716221119cbb3beeac156df36021a464c13e282de69
07_BROWSER_AND_PWA/android-chrome-192x192.png|icons/stkflo-192.png|68e58c30dcc096e14bc110135b8ec7e49f46dc0b443d6537b1a03357c05bcd95
07_BROWSER_AND_PWA/android-chrome-512x512.png|icons/stkflo-512.png|9adf7ba98ed678f4688631f1f592c5fc08daa6550f7adca99f36bd385b0f126b
07_BROWSER_AND_PWA/maskable-icon-512x512.png|icons/stkflo-maskable-512.png|9349065e687d520e96b70f4f7c910b37b7c7e4c95218c5d8fd8896573ee96143
07_BROWSER_AND_PWA/apple-touch-icon.png|icons/stkflo-apple-touch.png|482ae07618dc519406ccfb455370b305ef6f97cc9887dee52ac5ca43fd7ab9f1
07_BROWSER_AND_PWA/favicon.ico|icons/stkflo-favicon.ico|f96719be61b5948ea344b7ef661861cda6918b14175034b48f812c028d544903
APPROVED_ASSETS

# Stage all nine assets and validate BEFORE modifying any files.
for i in "${!NAMES[@]}"; do
  relative="${NAMES[$i]}"
  staged="$STAGE/asset-$i"
  if [[ -d "$SOURCE" ]]; then
    mapfile -d '' -t matches < <(find "$SOURCE" -type f -path "*/$relative" -print0)
    if (( ${#matches[@]} != 1 )); then
      echo "ERROR: Expected one $relative under $SOURCE; found ${#matches[@]}." >&2
      exit 1
    fi
    cp "${matches[0]}" "$staged"
  else
    mapfile -t matches < <(unzip -Z1 "$SOURCE" | grep -F "/$relative" || true)
    if (( ${#matches[@]} != 1 )) || [[ "${matches[0]}" != */"$relative" ]]; then
      echo "ERROR: Expected one $relative in $SOURCE; found ${#matches[@]}." >&2
      exit 1
    fi
    unzip -p "$SOURCE" "${matches[0]}" > "$staged"
  fi
  [[ -s "$staged" ]] || { echo "ERROR: Missing or empty artwork: $relative" >&2; exit 1; }
  digest="$(sha256sum "$staged")"; digest="${digest%% *}"
  if [[ "$digest" != "${HASHES[$i]}" ]]; then
    echo "ERROR: Unexpected artwork version: $relative" >&2
    echo "  SHA-256: $digest" >&2
    echo "Check that the folder is from the approved high-quality regenerated ZIP." >&2
    exit 1
  fi
done

# Publish only after successful verification.
for i in "${!NAMES[@]}"; do
  path="$ROOT/web/public/${DESTS[$i]}"
  mkdir -p "$(dirname "$path")"
  cp "$STAGE/asset-$i" "$path.installing"
  mv -f "$path.installing" "$path"
  echo "Verified and installed web/public/${DESTS[$i]}"
done
echo "All ${#NAMES[@]} StkFlo premium assets installed successfully."

if [[ "$ACTION" == "--push" ]]; then
  cd "$ROOT"
  paths=()
  for dest in "${DESTS[@]}"; do
    paths+=("web/public/$dest")
    git add "web/public/$dest"
  done
  if ! git diff --cached --quiet -- "${paths[@]}"; then
    git commit --only -m "Install approved high-quality StkFlo branding and PWA icons" -- "${paths[@]}"
  else
    echo "Exact artwork is already committed; nothing new to commit."
  fi
  git push -u origin "$BRANCH"
  echo "Pushed verified StkFlo artwork to $BRANCH"
else
  echo "To commit & push the verified assets, rerun this command with --push."
fi
