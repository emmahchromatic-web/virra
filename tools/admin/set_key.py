#!/usr/bin/env python3
"""Put the Supabase service_role key into tools/admin/.env from the clipboard.

    1. Copy the key in the Supabase dashboard (Project Settings -> API -> service_role)
    2. tools/admin/.venv/bin/python tools/admin/set_key.py

Written because `open -e` does not launch an editor from every terminal, and
because a key that is never displayed cannot be shoulder-surfed, pasted into
the wrong window, or left in scrollback. The key is checked before it is
written and is never printed back.
"""

from __future__ import annotations

import argparse
import base64
import json
import subprocess
import sys
from pathlib import Path

ADMIN_DIR = Path(__file__).resolve().parent
DEFAULT_ENV = ADMIN_DIR / ".env"
FIELD = "SUPABASE_SERVICE_ROLE_KEY"


def read_key(source: str | None, *, from_stdin: bool = False) -> str:
    if source is not None:
        return source.strip()
    # Reading stdin only on an explicit flag. Auto-detecting a non-tty looks
    # clever and hangs forever in any terminal that is not a real tty — which
    # is exactly where this script is most needed.
    if from_stdin:
        return sys.stdin.read().strip()
    try:
        return subprocess.run(["pbpaste"], capture_output=True, text=True, timeout=10).stdout.strip()
    except (OSError, subprocess.SubprocessError) as error:
        raise SystemExit(
            f"  Could not read the clipboard: {error}\n\n"
            "  Pipe the key in instead:\n"
            "    pbpaste | .venv/bin/python set_key.py --stdin"
        )


def describe(key: str) -> str:
    """Say what the key is, without ever revealing it."""
    if not key:
        raise SystemExit(
            "  The clipboard is empty.\n\n"
            "  Copy the key first: Supabase dashboard -> Project Settings -> API\n"
            "  -> service_role (the secret one, below anon; click to reveal)."
        )
    if any(character.isspace() for character in key):
        raise SystemExit(
            "  The clipboard holds several words, so it is probably not the key.\n"
            "  Copy just the key itself, nothing around it."
        )
    if key.startswith("sb_secret_"):
        return "sb_secret key"

    parts = key.split(".")
    if len(parts) != 3:
        raise SystemExit(
            "  That does not look like a Supabase key (expected a JWT or an\n"
            "  sb_secret_ key). Check what is on the clipboard and try again."
        )
    try:
        payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
        role = json.loads(base64.urlsafe_b64decode(payload_b64)).get("role")
    except Exception:  # noqa: BLE001 - an unreadable payload is not proof of anything
        return "a JWT (role could not be read)"

    if role == "anon":
        raise SystemExit(
            "  That is the ANON key, not the service_role key.\n\n"
            "  The anon key cannot read or write content tables, so every screen\n"
            "  would come up empty. Copy the one labelled service_role instead."
        )
    if role and role != "service_role":
        raise SystemExit(f"  That key has role '{role}', expected 'service_role'.")
    return "a service_role JWT"


def write_key(env_file: Path, key: str) -> bool:
    """Replace the key line, keeping every other line as it is."""
    if not env_file.exists():
        raise SystemExit(
            f"  {env_file} does not exist.\n"
            f"  Copy {ADMIN_DIR / '.env.example'} to it first."
        )

    lines = env_file.read_text(encoding="utf-8").splitlines()
    replaced = False
    already_set = False
    for index, line in enumerate(lines):
        if line.startswith(f"{FIELD}="):
            already_set = bool(line.partition("=")[2].strip())
            lines[index] = f"{FIELD}={key}"
            replaced = True
            break
    if not replaced:
        lines.append(f"{FIELD}={key}")

    env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    env_file.chmod(0o600)
    return already_set


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, default=DEFAULT_ENV, help="which .env to write")
    parser.add_argument("--key", help="the key itself (for testing; normally read from the clipboard)")
    parser.add_argument("--stdin", action="store_true", help="read the key from stdin instead of the clipboard")
    args = parser.parse_args()

    key = read_key(args.key, from_stdin=args.stdin)
    kind = describe(key)
    replaced = write_key(args.file, key)

    print(f"\n  Saved {kind} to {args.file}")
    print("  (replacing the one that was already there)" if replaced else "  (the field was empty)")
    print("  File permissions set to owner-only. It is git-ignored.\n")
    print("  Start the console with:\n")
    print(f"    {ADMIN_DIR / '.venv/bin/python'} {ADMIN_DIR / 'run.py'}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
