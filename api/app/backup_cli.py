"""Host-tool entry point for creating a backup through the shared engine."""

from __future__ import annotations

import argparse
import json
import sys

from .services.backup_service import BackupError, create_backup


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--type", default="MANUAL", choices=["AUTO", "MANUAL", "PRE_RESTORE", "INITIAL"])
    parser.add_argument("--actor", default="WINDOWS_ADMINISTRATOR")
    parser.add_argument("--reason", default="")
    args = parser.parse_args()
    try:
        manifest = create_backup(actor=args.actor, backup_type=args.type, reason=args.reason)
    except BackupError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
