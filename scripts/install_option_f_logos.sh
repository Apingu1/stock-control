#!/usr/bin/env bash
# Install the unmodified, approved Option F SVGs from the supplied branding ZIP.
# Usage: bash scripts/install_option_f_logos.sh path/to/branding.zip
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP_PATH="${1:-$ROOT/Unison_OptionF_Codespace_Exact_SVG_Assets.zip}"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "ERROR: Branding ZIP not found: $ZIP_PATH"
  echo "Upload the ZIP into the Codespace workspace and pass its path."
  exit 1
fi

python3 - "$ZIP_PATH" "$ROOT" <<'PY'
from pathlib import Path
from zipfile import ZipFile
import hashlib
import os
import sys

zip_path = Path(sys.argv[1])
root = Path(sys.argv[2])
target_dir = root / "web" / "public" / "branding"
target_dir.mkdir(parents=True, exist_ok=True)
expected = {
    "Unison_OptionF_Full_Logo.svg": "62c4cee90778759e67ff5338b017ce0b20ae1c1dca5e89fe4898eee125131ba5",
    "Unison_OptionF_Monogram.svg": "743f8a5395eb8af9e86ce52d16e0e7a2d1584ec5f914ce8aa84114af97edbdbfeac0ed970f",
}

with ZipFile(zip_path) as source:
    members = source.namelist()
    verified = {}
    for filename, digest in expected.items():
        matches = [member for member in members if member.endswith("/" + filename)]
        if len(matches) != 1:
            raise SystemExit(f"ERROR: Expected exactly one {filename} in archive, found {len(matches)}")
        data = source.read(matches[0])
        actual = hashlib.sha256(data).hexdigest()
        if actual != digest:
            raise SystemExit(f"ERROR: {filename} does not match the approved ZIP SHA-256: {actual}")
        if not data.lstrip().startswith(b"<svg") or b"data:image/png;base64" not in data[:600]:
            raise SystemExit(f"ERROR: {filename} does not contain the expected embedded SVG artwork")
        verified[filename] = data

for filename, data in verified.items():
    dest = target_dir / filename
    tmp = dest.with_name(dest.name + ".installing")
    try:
        tmp.write_bytes(data)
        os.replace(tmp, dest)
    finally:
        tmp.unlink(missing_ok=True)
    print(f"Installed exact approved SVG: {dest.relative_to(root)} ({len(data):,} bytes)")

print("\nOption F assets verified. No existing data, backend or Docker configuration was changed.")
PY

echo
echo "Review changes, then commit both images:"
echo "  git add web/public/branding/Unison_OptionF_Full_Logo.svg web/public/branding/Unison_OptionF_Monogram.svg"
echo "  git commit -m 'Add exact approved Option F SVG branding assets'"
echo "  git push origin feature/unison-branding-navigation"
