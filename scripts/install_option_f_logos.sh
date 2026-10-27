#!/usr/bin/env bash
# Install the exact original Option F SVGs from the approved brand ZIP.
# The Codespace itself does not need Python: use unzip, or the API container.
# Usage: bash scripts/install_option_f_logos.sh /path/to/branding.zip
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP_PATH="$ROOT/Unison_OptionF_FULL_Logo_and_Branding_Package.zip"
if [[ $# -gt 0 ]]; then ZIP_PATH="$1"; fi
DEST="$ROOT/web/public/branding"
EXPECTED_FULL="62c4cee90778759e67ff5338b017ce0b20ae1c1dca5e89fe4898eee125131ba5"
EXPECTED_MONOGRAM="743f8a5395eb8af900e3d2c1584ec5f914ce8aa84114af97edbdbfeac0ed970f"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "ERROR: Branding ZIP not found: $ZIP_PATH" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

if command -v unzip >/dev/null 2>&1; then
  echo "Extracting approved SVGs using unzip (no Python needed)..."
  for filename in Unison_OptionF_Full_Logo.svg Unison_OptionF_Monogram.svg; do
    member="$(unzip -Z1 "$ZIP_PATH" | grep -E "(^|/)$filename$" || true)"
    if [[ -z "$member" || "$member" == *$'\n'* ]]; then
      echo "ERROR: Expected exactly one $filename in the ZIP." >&2
      exit 1
    fi
    unzip -p "$ZIP_PATH" "$member" > "$STAGE/$filename"
  done
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: Neither unzip nor Docker is available to extract the ZIP." >&2
    exit 1
  fi
  echo "unzip unavailable; extracting with Python inside the running API container..."
  PY_EXTRACT=$(cat <<'PY'
import hashlib
import io
import sys
import tarfile
import zipfile

expected = {
    "Unison_OptionF_Full_Logo.svg": "62c4cee90778759e67ff5338b017ce0b20ae1c1dca5e89fe4898eee125131ba5",
    "Unison_OptionF_Monogram.svg": "743f8a5395eb8af900e3d2c1584ec5f914ce8aa84114af97edbdbfeac0ed970f",
}
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:
    found = {}
    for filename, digest in expected.items():
        matches = [entry for entry in archive.namelist()
                   if entry == filename or entry.endswith("/" + filename)]
        if len(matches) != 1:
            raise SystemExit(f"Expected exactly one {filename}; got {len(matches)}")
        data = archive.read(matches[0])
        if hashlib.sha256(data).hexdigest() != digest:
            raise SystemExit(f"Approved-brand checksum mismatch: {filename}")
        found[filename] = data

with tarfile.open(fileobj=sys.stdout.buffer, mode="w|") as output:
    for filename, data in found.items():
        entry = tarfile.TarInfo(filename)
        entry.size = len(data)
        entry.mode = 0o644
        output.addfile(entry, io.BytesIO(data))
PY
)
  docker compose --env-file "$ROOT/.env" -f "$ROOT/infra/docker-compose.yml" \
    exec -T api python -c "$PY_EXTRACT" < "$ZIP_PATH" | tar -xf - -C "$STAGE"
fi

if ! command -v sha256sum >/dev/null 2>&1; then
  echo "ERROR: sha256sum is required to verify approved artwork." >&2
  exit 1
fi

check_original() {
  local filename="$1" expected="$2" actual
  [[ -s "$STAGE/$filename" ]] || { echo "ERROR: Missing SVG: $filename" >&2; exit 1; }
  actual="$(sha256sum "$STAGE/$filename")"
  actual="${actual%% *}"
  if [[ "$actual" != "$expected" ]]; then
    echo "ERROR: Wrong brand version for $filename. SHA-256: $actual" >&2
    exit 1
  fi
}
check_original Unison_OptionF_Full_Logo.svg "$EXPECTED_FULL"
check_original Unison_OptionF_Monogram.svg "$EXPECTED_MONOGRAM"

mkdir -p "$DEST"
for filename in Unison_OptionF_Full_Logo.svg Unison_OptionF_Monogram.svg; do
  cp "$STAGE/$filename" "$DEST/$filename.installing"
  mv -f "$DEST/$filename.installing" "$DEST/$filename"
  echo "Installed original: web/public/branding/$filename"
done

echo
echo "Original Option F logos installed and verified. No backend, database or Docker changes."
echo "Commit and push the two original SVGs:"
echo "  git add web/public/branding/Unison_OptionF_Full_Logo.svg web/public/branding/Unison_OptionF_Monogram.svg"
echo "  git commit -m 'Add exact approved Option F SVG logos'"
echo "  git push origin feature/unison-branding-navigation"
