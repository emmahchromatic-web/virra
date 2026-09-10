"""Configuration and the safety rails that have to hold before anything runs.

The console talks to production Supabase with the `service_role` key, which
bypasses row-level security entirely. Everything defensive lives here so the
rails are one short file you can read in full rather than a property of the
routing code.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

# tools/admin/admin/config.py -> tools/admin
ADMIN_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = ADMIN_DIR.parent.parent
ENV_FILE = ADMIN_DIR / ".env"
CHANGES_DIR = ADMIN_DIR / "changes"

# The only tables this tool may touch, ever. Every request is checked against
# this set in db.py. User-owned tables (activities, cycle_logs, user_profiles,
# food_entries, strength_set_logs, ...) are deliberately absent: with the
# service_role key there is otherwise nothing stopping a stray table name.
ALLOWLIST = frozenset(
    {
        # Recipes
        "recipes",
        "recipe_ingredients",
        "recipe_steps",
        # Strength programmes
        "programmes",
        "programme_days",
        "programme_exercises",
        "exercises",
        # Presentation copy for plans (run + strength). The console never edits
        # sessions_json by hand; for strength it regenerates it from the
        # programme, and for run the schedule now comes from the generator.
        "plan_templates",
    }
)


class ConfigError(RuntimeError):
    """Raised for anything that should stop the server before it binds."""


def _read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip("'\"")
    return values


def _assert_env_file_is_ignored() -> None:
    """Refuse to start if .env is not ignored by git.

    A service_role key in a tracked file is the one mistake here that cannot be
    undone by editing the file afterwards, so it is checked before the key is
    ever loaded rather than trusted to .gitignore staying as it is.
    """
    try:
        result = subprocess.run(
            ["git", "check-ignore", "-q", str(ENV_FILE)],
            cwd=REPO_ROOT,
            capture_output=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        # No git available: nothing to verify, and nothing to leak into.
        return
    if result.returncode != 0:
        raise ConfigError(
            f"{ENV_FILE} is NOT ignored by git.\n"
            "Refusing to start rather than risk committing the service_role key.\n"
            "Add `.env` to .gitignore, or move the file, then try again."
        )


class Config:
    def __init__(self) -> None:
        file_env = _read_env_file(ENV_FILE)

        def get(key: str, default: str = "") -> str:
            # A real environment variable wins, so a one-off
            # `ADMIN_READONLY=1 python3 run.py` works without editing .env.
            return os.environ.get(key) or file_env.get(key, default)

        self.supabase_url = get("SUPABASE_URL").rstrip("/")
        self.service_key = get("SUPABASE_SERVICE_ROLE_KEY")
        self.readonly = get("ADMIN_READONLY", "0") not in ("", "0", "false", "False")
        self.port = int(get("ADMIN_PORT", "8787"))

    def validate(self) -> None:
        _assert_env_file_is_ignored()

        if not self.supabase_url or not self.service_key:
            raise ConfigError(
                f"Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n\n"
                f"Copy {ADMIN_DIR / '.env.example'} to {ENV_FILE} and fill it in.\n"
                "The service_role key is in the Supabase dashboard under\n"
                "Project Settings -> API -> service_role (the secret one, not anon)."
            )
        if not self.supabase_url.startswith("https://"):
            raise ConfigError(f"SUPABASE_URL must be an https URL, got: {self.supabase_url}")
        self._assert_key_is_service_role()

        CHANGES_DIR.mkdir(parents=True, exist_ok=True)

    def _assert_key_is_service_role(self) -> None:
        """Catch the anon key being pasted in by mistake.

        Both keys sit on the same dashboard page and look alike. With the anon
        key every read returns an empty list (RLS is `to authenticated`) and
        every write 401s, which reads as "the tool is broken" rather than
        "wrong key" — so say so plainly here instead.
        """
        if self.service_key.startswith("sb_secret_"):
            return  # Supabase's newer non-JWT secret key format.

        parts = self.service_key.split(".")
        if len(parts) != 3:
            raise ConfigError(
                "SUPABASE_SERVICE_ROLE_KEY is neither a JWT nor an sb_secret_ key.\n"
                "Check you copied the whole thing."
            )

        import base64
        import json

        try:
            payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
            role = json.loads(base64.urlsafe_b64decode(payload_b64)).get("role")
        except Exception:  # noqa: BLE001 - an unreadable payload is not fatal
            return

        if role == "anon":
            raise ConfigError(
                "That is the ANON key, not the service_role key.\n\n"
                "The anon key cannot read or write content tables (RLS is\n"
                "`to authenticated`), so every screen would come up empty.\n"
                "Dashboard -> Project Settings -> API -> service_role."
            )
        if role and role != "service_role":
            raise ConfigError(f"Key has role '{role}', expected 'service_role'.")


config = Config()
