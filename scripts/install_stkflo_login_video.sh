#!/usr/bin/env bash
# Install the approved, silent StkFlo login animation and static poster.
# Usage:
#   bash scripts/install_stkflo_login_video.sh "/workspaces/stock-control/StkFlo_Login_Video_Pack.zip" --push
# Or pass the extracted StkFlo_Login_Video_Pack folder instead of the ZIP.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${1:-$ROOT/StkFlo_Login_Video_Pack.zip}"
ACTION="${2:-}"
BRANCH="feature/stkflo-rebrand"

if [[ -n "$ACTION" && "$ACTION" != "--push" ]]; then
  echo "ERROR: Second argument must be --push, or omitted." >&2; exit 1
fi
if [[ ! -d "$SOURCE" && ! -f "$SOURCE" ]]; then
  echo "ERROR: Video ZIP or extracted folder not found: $SOURCE" >&2
  exit 1
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  echo "ERROR: sha256sum is required." >&2; exit 1
fi
if [[ -f "$SOURCE" ]] && ! command -v unzip >/dev/null 2>&1; then
  echo "ERROR: unzip not available; extract ZIP first and pass the extracted folder." >&2
  exit 1
fi
if [[ "$ACTION" == "--push" ]]; then
  current="$(git -C "$ROOT" branch --show-current)"
  if [[ "$current" != "$BRANCH" ]]; then
    echo "ERROR: Switch to $BRANCH before committing. Current: $current" >&2
    exit 1
  fi
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
NAMES=("stkflo-login-loop.mp4" "stkflo-login-poster.webp")
HASHES=(
  "59fef686494beb19f7c48f52a388b5c5f68e5323183cf12eb96fe96d142d8b4d"
  "8042c9afa7390baa697f4b3d8ff6e226280448392b4e51b028ef0d4261f7c87e"
)

for i in "${!NAMES[@]}"; do
  name="${NAMES[$i]}"
  if [[ -d "$SOURCE" ]]; then
    mapfile -d '' -t matches < <(find "$SOURCE" -type f -name "$name" -print0)
    if (( ${#matches[@]} != 1 )); then
      echo "ERROR: Expected exactly one $name in $SOURCE; found ${#matches[@]}." >&2
      exit 1
    fi
    cp "${matches[0]}" "$STAGE/$name"
  else
    mapfile -t matches < <(unzip -Z1 "$SOURCE" | grep -E "(^|/)$name$" || true)
    if (( ${#matches[@]} != 1 )); then
      echo "ERROR: Expected exactly one $name in ZIP; found ${#matches[@]}." >&2
      exit 1
    fi
    unzip -p "$SOURCE" "${matches[0]}" > "$STAGE/$name"
  fi
  [[ -s "$STAGE/$name" ]] || { echo "ERROR: Empty/missing $name" >&2; exit 1; }
  digest="$(sha256sum "$STAGE/$name")"; digest="${digest%% *}"
  if [[ "$digest" != "${HASHES[$i]}" ]]; then
    echo "ERROR: Incorrect media version: $name ($digest)" >&2
    exit 1
  fi
done

DEST="$ROOT/web/public/branding"
mkdir -p "$DEST"
for name in "${NAMES[@]}"; do
  cp "$STAGE/$name" "$DEST/$name.installing"
  mv -f "$DEST/$name.installing" "$DEST/$name"
  echo "Installed and verified web/public/branding/$name"
done

if [[ "$ACTION" == "--push" ]]; then
  cd "$ROOT"
  git add web/public/branding/stkflo-login-loop.mp4 web/public/branding/stkflo-login-poster.webp
  if ! git diff --cached --quiet -- web/public/branding/stkflo-login-loop.mp4 web/public/branding/stkflo-login-poster.webp; then
    git commit --only -m "Add optimized StkFlo login video and poster" -- web/public/branding/stkflo-login-loop.mp4 web/public/branding/stkflo-login-poster.webp
  fi
  git push -u origin "$BRANCH"
  echo "StkFlo login animation committed and pushed to $BRANCH"
else
  echo "Installed; rerun with --push to commit the two media assets."
fi
