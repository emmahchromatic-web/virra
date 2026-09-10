"""Regenerate the `plan_templates` row that a strength programme owns.

Strength plan templates are not authored — migration
`20260819010000_get_strong_plan_templates.sql` *generates* them from
`programmes` and `programme_days`. Editing a programme without redoing that
leaves the plan picker showing the old name, tagline and day focuses, which is
the failure this module exists to prevent.

The one deliberate difference from the migration: it hardcodes 12 weeks, this
uses `programmes.duration_weeks`. The column exists and defaults to 12, so the
two agree for every programme seeded so far; following the column is what makes
the console able to author a programme of another length.
"""

from __future__ import annotations

from typing import Any

from . import db


def _week_label(week: int, total: int) -> str:
    """Periodisation label per 4-week block, every 4th week a deload."""
    if week % 4 == 0:
        return "Deload"
    third = max(total // 3, 1)
    if week <= third:
        return "Base"
    if week <= third * 2:
        return "Build"
    return "Peak"


def build_sessions_json(programme: dict[str, Any], days: list[dict[str, Any]]) -> list[dict]:
    focuses = [day["focus"] for day in sorted(days, key=lambda d: d["day_index"])]
    weeks = int(programme.get("duration_weeks") or 12)
    return [
        {
            "week": week,
            "km": 0,
            "label": _week_label(week, weeks),
            "sessions": focuses,
        }
        for week in range(1, weeks + 1)
    ]


def sync_plan_template(programme_id: str) -> dict[str, Any] | None:
    """Rewrite the programme's plan_templates row from the programme itself.

    Returns the stored row, or None when the programme is inactive (in which
    case its template row is removed, so an inactive programme cannot keep a
    live entry in the picker).
    """
    programme = db.select_one("programmes", id=f"eq.{programme_id}")
    if programme is None:
        raise ValueError(f"No programme '{programme_id}'")

    if not programme.get("is_active"):
        db.delete("plan_templates", programme_id=f"eq.{programme_id}")
        return None

    days = db.select("programme_days", programme_id=f"eq.{programme_id}", order="day_index")

    row = {
        "name": programme["name"],
        "sport_type": "strength",
        "duration_weeks": int(programme.get("duration_weeks") or 12),
        "description": programme.get("full_description"),
        "tagline": programme.get("short_description"),
        "sort_order": programme.get("sort_order", 0),
        "programme_id": programme_id,
        "is_active": True,
        "sessions_json": build_sessions_json(programme, days),
    }

    existing = db.select_one("plan_templates", programme_id=f"eq.{programme_id}")
    if existing:
        stored = db.update("plan_templates", row, id=f"eq.{existing['id']}")
    else:
        stored = db.insert("plan_templates", row)
    return stored[0] if stored else None
