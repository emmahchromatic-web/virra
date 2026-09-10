"""Append-only local log of every write, so "what did I change on Tuesday" is
answerable without a database audit table.

One JSON object per line in `tools/admin/changes/YYYY-MM-DD.jsonl`. Untracked.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from .config import CHANGES_DIR


def record(action: str, table: str, row_id: Any, before: Any = None, after: Any = None) -> None:
    CHANGES_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    entry = {
        "at": now.isoformat(timespec="seconds"),
        "action": action,
        "table": table,
        "id": row_id,
        "before": before,
        "after": after,
    }
    path = CHANGES_DIR / f"{now:%Y-%m-%d}.jsonl"
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, default=str) + "\n")


def recent(limit: int = 40) -> list[dict[str, Any]]:
    """Newest entries first, across the most recent log files."""
    entries: list[dict[str, Any]] = []
    for path in sorted(CHANGES_DIR.glob("*.jsonl"), reverse=True):
        for line in reversed(path.read_text(encoding="utf-8").splitlines()):
            if not line.strip():
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
            if len(entries) >= limit:
                return entries
    return entries
