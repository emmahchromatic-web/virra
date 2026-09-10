"""Authored strength programmes: `programmes` -> `programme_days` ->
`programme_exercises`, plus the shared `exercises` catalogue.

Every save of a programme's identity or its days also regenerates the
`plan_templates` row derived from it (see derive.py), because those two going
out of step is invisible in the database and obvious in the app.
"""

from __future__ import annotations

from typing import Any

from . import audit, db, derive, forms, validators
from .validators import BLOCKS, SECTIONS, VARIANTS, ValidationError

DAY_FIELDS = ["day_index", "focus"]
EXERCISE_FIELDS = ["exercise_id", "block", "section", "sets", "reps", "tempo", "rest"]


# --- reading ---------------------------------------------------------------


def list_all() -> list[dict[str, Any]]:
    return db.select("programmes", order="family,sort_order,name")


def load(programme_id: str) -> dict[str, Any] | None:
    programme = db.select_one("programmes", id=f"eq.{programme_id}")
    if programme is None:
        return None
    programme["days"] = db.select("programme_days", programme_id=f"eq.{programme_id}", order="day_index")
    programme["template"] = db.select_one("plan_templates", programme_id=f"eq.{programme_id}")
    return programme


def load_day(programme_id: str, day_index: int) -> dict[str, Any] | None:
    day = db.select_one(
        "programme_days", programme_id=f"eq.{programme_id}", day_index=f"eq.{day_index}"
    )
    if day is None:
        return None
    rows = db.select(
        "programme_exercises",
        programme_day_id=f"eq.{day['id']}",
        order="variant,block,section,position",
    )
    # Grouped the way the screen reads it: one column per variant, blocks down
    # the page. Seeing the three side by side is the whole point — a missing
    # bodyweight accessory is invisible in a flat row list.
    grid: dict[str, dict[int, list[dict[str, Any]]]] = {
        variant: {block: [] for block in BLOCKS} for variant in VARIANTS
    }
    for row in rows:
        grid.setdefault(row["variant"], {b: [] for b in BLOCKS})
        grid[row["variant"]].setdefault(row["block"], []).append(row)
    day["grid"] = grid
    day["exercise_rows"] = rows
    return day


def all_exercises() -> list[dict[str, Any]]:
    return db.select("exercises", order="name")


def exercise_usage() -> dict[str, int]:
    """How many programmes reference each exercise.

    Decision D: the catalogue is editable, but a rename propagates into every
    programme silently, so the count is shown before the save.
    """
    day_to_programme = {
        day["id"]: day["programme_id"] for day in db.select("programme_days", columns="id,programme_id")
    }
    usage: dict[str, set[str]] = {}
    for row in db.select("programme_exercises", columns="exercise_id,programme_day_id"):
        programme = day_to_programme.get(row["programme_day_id"])
        if programme:
            usage.setdefault(row["exercise_id"], set()).add(programme)
    return {exercise_id: len(programmes) for exercise_id, programmes in usage.items()}


def gaps(programme_id: str) -> list[str]:
    days = db.select("programme_days", programme_id=f"eq.{programme_id}", order="day_index")
    if not days:
        return ["This programme has no days yet."]
    rows: list[dict[str, Any]] = []
    for day in days:
        rows.extend(
            db.select(
                "programme_exercises",
                columns="programme_day_id,variant,block,section",
                programme_day_id=f"eq.{day['id']}",
            )
        )
    return validators.programme_gaps(days, rows)


# --- writing ---------------------------------------------------------------


def blank() -> dict[str, Any]:
    return {
        "id": "",
        "family": "get_strong",
        "family_label": "Get Strong",
        "name": "",
        "sport_type": "strength",
        "days_per_week": 3,
        "duration_weeks": 12,
        "short_description": None,
        "full_description": None,
        "deload_note": None,
        "sort_order": 0,
        "is_active": False,
        "days": [],
        "template": None,
    }


def parse(form: Any, *, existing_id: str | None) -> dict[str, Any]:
    problems: list[str] = []

    name = forms.text(form, "name")
    if not name:
        problems.append("Name is required.")

    programme_id = forms.text(form, "id") or existing_id or validators.slugify(name)
    if validators.slugify(programme_id) != programme_id:
        problems.append(f"Id '{programme_id}' must be lowercase letters, numbers and hyphens.")

    duration_weeks = forms.integer(form, "duration_weeks", 12)
    if duration_weeks < 1:
        problems.append("Duration must be at least 1 week.")

    programme = {
        "id": programme_id,
        "family": forms.text(form, "family") or "get_strong",
        "family_label": forms.text(form, "family_label") or "Get Strong",
        "name": name,
        "sport_type": "strength",
        "days_per_week": forms.integer(form, "days_per_week", 3),
        "duration_weeks": duration_weeks,
        "short_description": forms.optional_text(form, "short_description"),
        "full_description": forms.optional_text(form, "full_description"),
        "deload_note": forms.optional_text(form, "deload_note"),
        "sort_order": forms.integer(form, "sort_order", 0),
        "is_active": forms.flag(form, "is_active"),
    }

    days: list[dict[str, Any]] = []
    seen_indexes: set[int] = set()
    for raw in forms.rows_from(form, "day", DAY_FIELDS):
        if not raw["focus"]:
            continue
        try:
            index = int(raw["day_index"])
        except (TypeError, ValueError):
            problems.append(f"Day '{raw['focus']}' has no day number.")
            continue
        if index in seen_indexes:
            problems.append(f"Day {index} appears twice.")
            continue
        seen_indexes.add(index)
        days.append(
            {
                "id": validators.day_id(programme_id, index),
                "programme_id": programme_id,
                "day_index": index,
                "focus": raw["focus"],
                "sort_order": index,
            }
        )

    if programme["is_active"] and not days:
        problems.append("An active programme needs at least one day.")
    if days and len(days) != programme["days_per_week"]:
        problems.append(
            f"Days per week is {programme['days_per_week']} but {len(days)} day(s) are defined. "
            "The plan picker reads days_per_week, the schedule reads the days."
        )

    if problems:
        raise ValidationError(problems)

    return {"programme": programme, "days": sorted(days, key=lambda d: d["day_index"])}


def save(parsed: dict[str, Any], *, before: dict[str, Any] | None) -> dict[str, Any]:
    programme = parsed["programme"]
    programme_id = programme["id"]

    db.upsert("programmes", programme)

    # Days are upserted rather than replaced: deleting a day cascades to its
    # exercises, so a day that survives the edit must keep its id and its work.
    kept = {day["id"] for day in parsed["days"]}
    for existing in db.select("programme_days", programme_id=f"eq.{programme_id}"):
        if existing["id"] not in kept:
            db.delete("programme_days", id=f"eq.{existing['id']}")
    if parsed["days"]:
        db.upsert("programme_days", parsed["days"])

    template = derive.sync_plan_template(programme_id)

    audit.record(
        "update" if before else "create",
        "programmes",
        programme_id,
        before=before,
        after={**programme, "days": len(parsed["days"]), "plan_template": bool(template)},
    )
    return load(programme_id) or programme


def parse_day_exercises(form: Any, day: dict[str, Any]) -> list[dict[str, Any]]:
    """One variant's worth of exercises for a day, from the grid editor."""
    problems: list[str] = []
    variant = forms.text(form, "variant")
    if variant not in VARIANTS:
        raise ValidationError([f"Variant must be one of {', '.join(VARIANTS)}."])

    catalogue = {row["id"] for row in db.select("exercises", columns="id")}
    rows: list[dict[str, Any]] = []
    counters: dict[tuple[int, str], int] = {}

    for raw in forms.rows_from(form, "ex", EXERCISE_FIELDS):
        if not raw["exercise_id"]:
            continue
        if raw["exercise_id"] not in catalogue:
            problems.append(f"'{raw['exercise_id']}' is not in the exercise catalogue.")
            continue
        try:
            block = int(raw["block"])
        except (TypeError, ValueError):
            problems.append(f"{raw['exercise_id']}: block must be 1, 2 or 3.")
            continue
        if block not in BLOCKS:
            problems.append(f"{raw['exercise_id']}: block must be 1, 2 or 3.")
            continue
        if raw["section"] not in SECTIONS:
            problems.append(f"{raw['exercise_id']}: section must be one of {', '.join(SECTIONS)}.")
            continue
        try:
            tempo = validators.validate_tempo(raw["tempo"])
        except ValidationError as error:
            problems.extend(error.problems)
            tempo = None

        key = (block, raw["section"])
        counters[key] = counters.get(key, 0) + 1
        sets_value: int | None
        try:
            sets_value = int(raw["sets"]) if raw["sets"] else None
        except ValueError:
            problems.append(f"{raw['exercise_id']}: sets must be a whole number.")
            sets_value = None

        rows.append(
            {
                "programme_day_id": day["id"],
                "variant": variant,
                "block": block,
                "section": raw["section"],
                "position": counters[key],
                "exercise_id": raw["exercise_id"],
                "sets": sets_value,
                "reps": raw["reps"] or None,
                "tempo": tempo,
                "rest": raw["rest"] or None,
            }
        )

    if problems:
        raise ValidationError(problems)
    return rows


def save_day_variant(day: dict[str, Any], variant: str, rows: list[dict[str, Any]]) -> None:
    before = db.select(
        "programme_exercises", programme_day_id=f"eq.{day['id']}", variant=f"eq.{variant}"
    )
    db.delete("programme_exercises", programme_day_id=f"eq.{day['id']}", variant=f"eq.{variant}")
    if rows:
        db.insert("programme_exercises", rows)
    audit.record(
        "update",
        "programme_exercises",
        f"{day['id']}/{variant}",
        before={"count": len(before)},
        after={"count": len(rows)},
    )


def set_active(programme_id: str, active: bool) -> None:
    before = db.select_one("programmes", id=f"eq.{programme_id}")
    db.update("programmes", {"is_active": active}, id=f"eq.{programme_id}")
    # Deactivating must also pull the row out of the plan picker.
    derive.sync_plan_template(programme_id)
    audit.record("activate" if active else "deactivate", "programmes", programme_id, before=before)


# --- exercise catalogue ----------------------------------------------------


def save_exercise(form: Any, *, existing_id: str | None) -> dict[str, Any]:
    problems: list[str] = []
    name = forms.text(form, "name")
    if not name:
        problems.append("Name is required.")

    exercise_id = forms.text(form, "id") or existing_id or validators.slugify(name)
    if validators.slugify(exercise_id) != exercise_id:
        problems.append(f"Id '{exercise_id}' must be lowercase letters, numbers and hyphens.")

    load_type = forms.text(form, "load_type") or "weighted"
    if load_type not in validators.LOAD_TYPES:
        problems.append(f"Load type must be one of {', '.join(validators.LOAD_TYPES)}.")

    try:
        tempo = validators.validate_tempo(forms.text(form, "default_tempo"))
    except ValidationError as error:
        problems.extend(error.problems)
        tempo = None

    if problems:
        raise ValidationError(problems)

    row = {
        "id": exercise_id,
        "name": name,
        "description": forms.optional_text(form, "description"),
        "load_type": load_type,
        "default_tempo": tempo,
    }
    before = db.select_one("exercises", id=f"eq.{exercise_id}")
    stored = db.upsert("exercises", row)
    audit.record("update" if before else "create", "exercises", exercise_id, before=before, after=row)
    return stored[0] if stored else row
