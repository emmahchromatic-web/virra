#!/usr/bin/env python3
"""Start the VIRRA admin console on localhost.

    python3 tools/admin/run.py

Binds 127.0.0.1 only. Nothing is deployed and there is no login, because the
only thing that can reach it is this machine.
"""

from __future__ import annotations

import sys
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from admin.config import ConfigError, config  # noqa: E402


def main() -> int:
    try:
        config.validate()
    except ConfigError as error:
        print(f"\n  Cannot start.\n\n  {str(error).replace(chr(10), chr(10) + '  ')}\n", file=sys.stderr)
        return 1

    try:
        import uvicorn
    except ModuleNotFoundError:
        print(
            "\n  Dependencies are not installed. From the repo root:\n\n"
            "    python3 -m venv tools/admin/.venv\n"
            "    tools/admin/.venv/bin/pip install -r tools/admin/requirements.txt\n"
            "    tools/admin/.venv/bin/python tools/admin/run.py\n",
            file=sys.stderr,
        )
        return 1

    url = f"http://127.0.0.1:{config.port}"
    mode = "READ-ONLY" if config.readonly else "read/write"
    print(f"\n  VIRRA admin console — {mode}")
    print(f"  {url}")
    print(f"  -> {config.supabase_url}  (production)\n")

    try:
        webbrowser.open(url)
    except Exception:  # noqa: BLE001 - opening a browser is a convenience, not a requirement
        pass

    uvicorn.run("admin.app:app", host="127.0.0.1", port=config.port, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
