"""Mobility sessions: `mobility_sessions` and their `mobility_session_moves`.

Card 264. One session is two tables edited on one screen, the way a recipe is:
the row and the ordered list of moves under it. There are no variants and no
blocks, which is exactly why these are not `programmes` (see the migration
20260913000000 for the reasoning), so the editor is a single form.

Moves carry their name and description inline rather than pointing at the
exercise catalogue. When a move's name matches a catalogue row and the
description is left blank, the catalogue's description is copied in at save
time, so a common move is written once and an unusual one can still be
described here.
"""

from __future__ import annotations

import re
from typing import Any

from . import audit, db, forms, validators
from .validators import INTENSITIES, PHASES, ValidationError

MOVE_FIELDS = ["name", "reps", "sets", "cue", "description"]

# Mirrors strengthProgramme.ts: what the app would estimate on its own. Shown
# for interest next to the clock estimate, which is the one that matters.
SECONDS_PER_MOVE = 30
SECONDS_PER_SET = 45

_DURATION = re.compile(r"(\d+)\s*(?:-\s*(\d+))?\s*(s|secs?|seconds?|mins?|minutes?)\b", re.I)


# --- reading ---------------------------------------------------------------


def list_all() -> list[dict[str, Any]]:
    rows = db.select("mobility_sessions", order="minutes,position,name")
    counts: dict[str, int] = {}
    for move in db.select("mobility_session_moves", columns="session_id"):
        counts[move["session_id"]] = counts.get(move["session_id"], 0) + 1
    for row in rows:
        row["move_count"] = counts.get(row["id"], 0)
    return rows


def load(session_id: str) -> dict[str, Any] | None:
    session = db.select_one("mobility_sessions", id=f"eq.{session_id}")
    if session is None:
        return None
    session["moves"] = db.select(
        "mobility_session_moves", session_id=f"eq.{session_id}", order="position"
    )
    return session


def blank() -> dict[str, Any]:
    return {
        "id": "",
        "name": "",
        "focus": None,
        "minutes": 10,
        "intensity": "gentle",
        "phases": [],
        "is_active": False,
        "position": 0,
        "moves": [],
    }


# --- timing ----------------------------------------------------------------


def clock_seconds(reps: str | None) -> int:
    """Roughly how long a move takes to do, from its prescription.

    Holds at their length, doubled for "each side"; breaths at five seconds;
    reps at three or four seconds, doubled for "each side" and "each way"; plus
    a few seconds to get into position. Same model as the seed builder, so the
    console and the first load agree.
    """
    if not reps:
        return SECONDS_PER_MOVE
    text = reps.replace("–", "-").lower()
    sides = 2 if "each side" in text else 1
    ways = 2 if "each way" in text else 1
    match = _DURATION.search(text)
    if match:
        scale = 60 if match.group(3).startswith("min") else 1
        low = int(match.group(1)) * scale
        high = int(match.group(2)) * scale if match.group(2) else low
        return int(((low + high) / 2) * sides + 5)
    digits = re.search(r"\d+", text)
    n = int(digits.group(0)) if digits else 1
    if "breath" in text:
        return n * 5 + 5
    per_rep = 4 if "slow" in text else 3
    return n * per_rep * sides * ways + 5


def estimates(moves: list[dict[str, Any]]) -> dict[str, int]:
    clock = sum(clock_seconds(m.get("reps")) for m in moves)
    app = sum(
        (m.get("sets") or 1) * (SECONDS_PER_SET if m.get("sets") else SECONDS_PER_MOVE)
        for m in moves
    )
    return {"clock_minutes": round(clock / 60), "app_minutes": round(app / 60)}


def timing_warnings(session: dict[str, Any], moves: list[dict[str, Any]]) -> list[str]:
    est = estimates(moves)
    stated = session.get("minutes") or 0
    if moves and abs(est["clock_minutes"] - stated) > 2:
        return [
            f"Says {stated} min but the moves add up to about {est['clock_minutes']} min on the clock. "
            "Shorten holds or drop moves until they agree, or change the minutes."
        ]
    return []


# --- writing ---------------------------------------------------------------


def parse(form: Any, *, existing_id: str | None) -> dict[str, Any]:
    problems: list[str] = []

    name = forms.text(form, "name")
    if not name:
        problems.append("Name is required.")

    session_id = forms.text(form, "id") or existing_id or validators.slugify(name)
    if validators.slugify(session_id) != session_id:
        problems.append(f"Id '{session_id}' must be lowercase letters, numbers and hyphens.")

    minutes = forms.integer(form, "minutes", 0)
    if not 5 <= minutes <= 90:
        problems.append("Minutes must be between 5 and 90.")

    intensity = forms.text(form, "intensity")
    if intensity not in INTENSITIES:
        problems.append(f"Intensity must be one of {', '.join(INTENSITIES)}.")

    try:
        phases = validators.subset_of(forms.checkboxes(form, "phases"), PHASES, "phases")
    except ValidationError as error:
        problems.extend(error.problems)
        phases = []
    if not phases:
        problems.append("Tick at least one phase. A session with none is unreachable, not universal.")

    focus = forms.optional_text(form, "focus")
    if focus and len(focus) > 90:
        problems.append(f"Focus is {len(focus)} characters; keep it under 90 so it fits under the name.")

    session = {
        "id": session_id,
        "name": name,
        "focus": focus,
        "minutes": minutes,
        "intensity": intensity,
        "phases": phases,
        "is_active": forms.flag(form, "is_active"),
        "position": forms.integer(form, "position", 0),
    }

    catalogue = {
        row["name"]: row.get("description")
        for row in db.select("exercises", columns="name,description")
    }
    moves: list[dict[str, Any]] = []
    for raw in forms.rows_from(form, "move", MOVE_FIELDS):
        if not raw["name"]:
            continue
        if not raw["reps"]:
            problems.append(f"'{raw['name']}': say how long or how many (reps is empty).")
        sets_value: int | None = None
        if raw["sets"]:
            try:
                sets_value = int(raw["sets"])
            except ValueError:
                problems.append(f"'{raw['name']}': sets must be a whole number, or blank.")
        description = raw["description"].strip() or catalogue.get(raw["name"]) or None
        if not description:
            problems.append(
                f"'{raw['name']}': needs a description. It is not in the exercise catalogue, "
                "so write one or two sentences here."
            )
        moves.append(
            {
                "session_id": session_id,
                "position": len(moves) + 1,
                "name": raw["name"],
                "description": description,
                "reps": raw["reps"] or None,
                "sets": sets_value,
                "cue": raw["cue"].strip() or None,
            }
        )

    if session["is_active"] and not moves:
        problems.append("An active session needs at least one move. The app refuses to open an empty one.")

    if problems:
        raise ValidationError(problems)

    return {"session": session, "moves": moves}


def save(parsed: dict[str, Any], *, before: dict[str, Any] | None) -> dict[str, Any]:
    session = parsed["session"]
    db.upsert("mobility_sessions", session)
    db.replace_children("mobility_session_moves", "session_id", session["id"], parsed["moves"])
    audit.record(
        "update" if before else "create",
        "mobility_sessions",
        session["id"],
        before=before,
        after={**session, "moves": len(parsed["moves"])},
    )
    return load(session["id"]) or session


def set_active(session_id: str, active: bool) -> None:
    before = db.select_one("mobility_sessions", id=f"eq.{session_id}")
    if active:
        moves = db.select("mobility_session_moves", columns="id", session_id=f"eq.{session_id}")
        if not moves:
            raise ValidationError(["Not activated: the session has no moves, and the app refuses to open an empty one."])
    db.update("mobility_sessions", {"is_active": active}, id=f"eq.{session_id}")
    audit.record("activate" if active else "deactivate", "mobility_sessions", session_id, before=before)


def hard_delete(session_id: str) -> None:
    before = load(session_id)
    db.delete("mobility_sessions", id=f"eq.{session_id}")  # moves cascade
    audit.record("delete", "mobility_sessions", session_id, before=before)


# --- content invariants ----------------------------------------------------


def coverage_warnings(sessions: list[dict[str, Any]]) -> list[str]:
    """Brief §4: every phase needs at least one active session at each length,
    or a woman in that phase opens the list and finds nothing at that duration."""
    active = [s for s in sessions if s.get("is_active")]
    if not active:
        return ["No active mobility sessions. The mobility list in the app is empty."]
    lengths = sorted({s["minutes"] for s in active})
    warnings: list[str] = []
    for minutes in lengths:
        for phase in PHASES:
            if not any(phase in (s.get("phases") or []) for s in active if s["minutes"] == minutes):
                warnings.append(f"No active {minutes}-minute session suits the {phase} phase.")
    return warnings
