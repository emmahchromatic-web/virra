"""Turning posted form data into rows the database will accept.

Repeating groups (ingredients, steps, exercises) are posted as flat fields
named `<prefix>-<n>-<field>`; `rows_from` collects them back into a list in
index order, dropping any group the browser left entirely blank.
"""

from __future__ import annotations

from typing import Any, Mapping


def rows_from(form: Mapping[str, Any], prefix: str, fields: list[str]) -> list[dict[str, str]]:
    indexes: set[int] = set()
    for key in form:
        parts = key.split("-", 2)
        if len(parts) == 3 and parts[0] == prefix and parts[1].isdigit():
            indexes.add(int(parts[1]))

    rows: list[dict[str, str]] = []
    for index in sorted(indexes):
        row = {field: str(form.get(f"{prefix}-{index}-{field}", "") or "").strip() for field in fields}
        if any(row.values()):
            rows.append(row)
    return rows


def checkboxes(form: Any, name: str) -> list[str]:
    """Multi-value field. Starlette's FormData needs getlist; a plain dict does not."""
    if hasattr(form, "getlist"):
        return [v for v in form.getlist(name) if v]
    value = form.get(name)
    if value is None:
        return []
    return [value] if isinstance(value, str) else list(value)


def text(form: Mapping[str, Any], name: str, default: str = "") -> str:
    return str(form.get(name, default) or "").strip()


def optional_text(form: Mapping[str, Any], name: str) -> str | None:
    """Blank stays NULL rather than becoming an empty string.

    Empty strings and NULLs read differently everywhere downstream — an empty
    intro renders as a blank line where a NULL renders as nothing.
    """
    return text(form, name) or None


def integer(form: Mapping[str, Any], name: str, default: int = 0) -> int:
    raw = text(form, name)
    if raw == "":
        return default
    try:
        return int(float(raw))
    except ValueError:
        return default


def flag(form: Mapping[str, Any], name: str) -> bool:
    return text(form, name).lower() in ("1", "on", "true", "yes")
