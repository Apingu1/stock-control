#!/usr/bin/env bash
# Install the exact approved StkFlo artwork without requiring Python on the host.
# Usage: bash scripts/install_stkflo_branding.sh "/path/to/StkFlo_COMPLETE_Logo_and_Branding_Package.zip" [--push]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP_PATH="${1:-$ROOT/StkFlo_COMPLETE_Logo_and_Branding_Package.zip}"
PUSH="${2:-}"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "ERROR: StkFlo brand ZIP not found: $ZIP_PATH" >&2
  echo 'Provide its path as the first argument (in quotes if it contains spaces).' >&2
  exit 1
fi
if [[ -n "$PUSH" && "$PUSH" != "--push" ]]; then
  echo "ERROR: Unknown option $PUSH (supported: --push)" >&2; exit 1
fi

NAMES=(
  StkFlo_Horizontal_WhiteStk_RasterBacked.svg
  StkFlo_SF_Monogram_RasterBacked.svg
  StkFlo_Dark_AppIcon_32px.png
  StkFlo_Dark_AppIcon_192px.png
  StkFlo_Dark_AppIcon_512px.png
  StkFlo_Dark_Android_Maskable_512px.png
  StkFlo_Apple_Touch_Icon_180.png
  StkFlo_Dark_Windows_Favicon.ico
)
HASHES=(
  4e141cd0ca30dd532e417356704c1d58cdd283ee6f96c0e581135d4dfe974f50
  53ea0b0a2baf1e365d4f192a57f2a6d004e45ed850d654ec25e7117664df6244
  7223f778d223b82bb13ffc318cea61296f04c5021e85188f0390576560b30625
  f3c3ba95f54048d8ac6ddc87b4df091cbf2a31512e598a789fcc56275c709543
  24f4c4eb421a44ec3e962ad1d6334b761b171605330b38783a787f8c70a0abec
  8c7b581a733b1038f612ccf187d81e3c5a28efbc50534d01412ba9850293c28c
  2f54a17536596d07b9966b47add61ae5c08f437eb7d4d9a75977fa22a639b35f
  90329731e1684306adb61b320388537d54c814e1f5a14269679279cd4be28896
)
DESTS=(
  branding/stkflo-horizontal.svg
  branding/stkflo-monogram.svg
  icons/stkflo-32.png
  icons/stkflo-192.png
  icons/stkflo-512.png
  icons/stkflo-maskable-512.png
  icons/stkflo-apple-touch.png
  icons/stkflo-favicon.ico
)
if ! command -v sha256sum >/dev/null 2>&1; then
  echo 'ERROR: sha256sum is required for artwork verification.' >&2; exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

if command -v unzip >/dev/null 2>&1; then
  for filename in "${NAMES[@]}"; do
    member="$(unzip -Z1 "$ZIP_PATH" | grep -F "/$filename" || true)"
    if [[ -z "$member" || "$member" == *$'\n'* || "$member" != */"$filename" ]]; then
      echo "ERROR: Expected exactly one $filename in ZIP." >&2; exit 1
    fi
    unzip -p "$ZIP_PATH" "$member" > "$STAGE/$filename"
  done
else
  # Some Codespaces do not have Python or unzip. Python inside our API image is used.
  if ! command -v docker >/dev/null 2>&1; then
    echo 'ERROR: Neither unzip nor Docker is available.' >&2; exit 1
  fi
  PY_EXTRACT=$(cat <<'PY'
import io, sys, tarfile, zipfile
names = [
    "StkFlo_Horizontal_WhiteStk_RasterBacked.svg",
    "StkFlo_SF_Monogram_RasterBacked.svg",
    "StkFlo_Dark_AppIcon_32px.png",
    "StkFlo_Dark_AppIcon_192px.png",
    "StkFlo_Dark_AppIcon_512px.png",
    "StkFlo_Dark_Android_Maskable_512px.png",
    "StkFlo_Apple_Touch_Icon_180.png",
    "StkFlo_Dark_Windows_Favicon.ico",
]
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:
    with tarfile.open(fileobj=sys.stdout.buffer, mode="w|") as output:
        for name in names:
            paths = [p for p in archive.namelist() if p.endswith("/" + name)]
            if len(paths) != 1:
                raise SystemExit("Expected exactly one %s, got %s" % (name, len(paths)))
            data = archive.read(paths[0])
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            entry.mode = 0o644
            output.addfile(entry, io.BytesIO(data))
PY
)
  docker compose --env-file "$ROOT/.env" -f "$ROOT/infra/docker-compose.yml" \
    exec -T api python -c "$PY_EXTRACT" < "$ZIP_PATH" | tar -xf - -C "$STAGE"
fi

# Verify ALL images before changing public assets, then publish them atomically per path.
for i in "${!NAMES[@]}"; do
  filename="${NAMES[$i]}"
  [[ -s "$STAGE/$filename" ]] || { echo "ERROR: Empty/missing $filename" >&2; exit 1; }
  actual="$(sha256sum "$STAGE/$filename")"
  actual="${actual%% *}"
  if [[ "$actual" != "${HASHES[$i]}" ]]; then
    echo "ERROR: Brand asset hash mismatch for $filename ($actual)" >&2
    exit 1
  fi
done
for i in "${!NAMES[@]}"; do
  dest="$ROOT/web/public/${DESTS[$i]}"
  mkdir -p "$(dirname "$dest")"
  cp "$STAGE/${NAMES[$i]}" "$dest.installing"
  mv -f "$dest.installing" "$dest"
  echo "Verified: web/public/${DESTS[$i]}"
done

echo "StkFlo 3D artwork, shortcut, favicon, Apple and PWA icons installed."
if [[ "$PUSH" == "--push" ]]; then
  cd "$ROOT"
  current="$(git branch --show-current)"
  if [[ "$current" != "feature/stkflo-rebrand" ]]; then
    echo "ERROR: --push requires feature/stkflo-rebrand (on $current)." >&2
    exit 1
  fi
  for dest in "${DESTS[@]}"; do git add "web/public/$dest"; done
  if ! git diff --cached --quiet; then
    git commit -m "Add verified approved StkFlo brand artwork and application icons"
  fi
  git push -u origin feature/stkflo-rebrand
  echo "StkFlo assets committed and pushed to feature/stkflo-rebrand."
else
  echo "To add exact assets to GitHub, rerun with --push or git add/commit/push them."
fi
