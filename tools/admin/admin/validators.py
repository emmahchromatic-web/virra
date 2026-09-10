"""The rules the database enforces, restated here so a mistake becomes a
readable message on the form instead of a PostgREST 400.

Every set and pattern in this file mirrors a CHECK constraint in
`mobile/supabase/migrations/`. If a constraint changes there, change it here.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Iterable

# --- recipes ---------------------------------------------------------------
# recipes_meal_types_check / _phases_check / _loads_check / _dietary_check
MEAL_TYPES = ("breakfast", "lunch", "dinner", "snack")
PHASES = ("menstrual", "follicular", "ovulatory", "luteal")
LOADS = ("rest", "easy", "moderate", "hard")
DIETARY = ("vegan", "vegetarian", "pescatarian", "gf", "df")
# recipe_ingredients_unit_check
UNITS = ("g", "ml")

MACROS = ("calories", "carbs_g", "protein_g", "fat_g", "fibre_g")
MACRO_LABELS = {
    "calories": "Calories",
    "carbs_g": "Carbs (g)",
    "protein_g": "Protein (g)",
    "fat_g": "Fat (g)",
    "fibre_g": "Fibre (g)",
}

# --- strength programmes ---------------------------------------------------
VARIANTS = ("gym", "dumbbells", "bodyweight")
BLOCKS = (1, 2, 3)
SECTIONS = ("mobility", "activation", "strength", "power_core", "accessory")
LOAD_TYPES = ("weighted", "optional", "none")
# exercises_default_tempo_format
TEMPO_RE = re.compile(r"^[0-9]+-[0-9]+-[0-9]+-[0-9]+$")


class ValidationError(ValueError):
    """One or more problems with what was submitted. Carries all of them."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


def slugify(text: str) -> str:
    """Match the id style already in the seeded content: lowercase, hyphenated."""
    normalised = unicodedata.normalize("NFKD", text or "")
    ascii_only = normalised.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")
    return slug or "untitled"


def subset_of(values: Iterable[str], allowed: Iterable[str], field: str) -> list[str]:
    allowed_set = set(allowed)
    chosen = [v for v in values if v]
    bad = [v for v in chosen if v not in allowed_set]
    if bad:
        raise ValidationError([f"{field}: {', '.join(bad)} is not one of {', '.join(allowed)}"])
    # De-duplicate but keep the authored order.
    seen: set[str] = set()
    return [v for v in chosen if not (v in seen or seen.add(v))]


def to_number(raw: Any, field: str, *, allow_blank: bool = True) -> float | None:
    """Blank means unknown (NULL), never zero.

    fibre_g is the reason this is explicit: the schema comment says a guessed
    fibre figure is worse than an absent one, and a plain number input would
    quietly turn "I don't know" into 0.
    """
    if raw is None or str(raw).strip() == "":
        if allow_blank:
            return None
        raise ValidationError([f"{field} is required"])
    try:
        return float(str(raw).strip())
    except ValueError:
        raise ValidationError([f"{field}: '{raw}' is not a number"]) from None


# --- macro derivation ------------------------------------------------------


def derive_macros(ingredients: list[dict[str, Any]], serves: int) -> dict[str, float | None]:
    """Per-serving totals from the ingredient rows.

    The schema's rule: `recipes.*` macros are the sum of `recipe_ingredients`
    divided by `serves`, so ingredients stay the single source of truth even
    though the totals are stored for cheap filtering.

    A macro is only derivable when EVERY ingredient supplies it. Where any is
    null the sum would silently under-count, so this returns None and the
    authored figure on the recipe stands instead — which is exactly the case
    the schema describes for sources that only give per-serving totals.
    """
    derived: dict[str, float | None] = {}
    if serves <= 0 or not ingredients:
        return {macro: None for macro in MACROS}
    for macro in MACROS:
        values = [row.get(macro) for row in ingredients]
        if any(value is None for value in values):
            derived[macro] = None
        else:
            derived[macro] = round(sum(float(v) for v in values) / serves, 1)
    return derived


def macro_drift(
    stored: dict[str, Any], derived: dict[str, float | None], tolerance: float = 1.0
) -> dict[str, tuple[float, float]]:
    """Macros where the stored figure and the ingredients disagree."""
    drift: dict[str, tuple[float, float]] = {}
    for macro, derived_value in derived.items():
        if derived_value is None:
            continue
        stored_value = stored.get(macro)
        if stored_value is None:
            drift[macro] = (0.0, derived_value)
            continue
        if abs(float(stored_value) - derived_value) > tolerance:
            drift[macro] = (float(stored_value), derived_value)
    return drift


# --- content invariants ----------------------------------------------------


def recipe_coverage_warnings(recipes: list[dict[str, Any]]) -> list[str]:
    """Re-run the assertions the seed migrations make.

    `20260827000000` requires every meal slot to have at least 2 active
    recipes or the "fits what's left today" rail breaks; `20260827010000`
    requires at least 1 per cycle phase or that phase's rail never appears.
    An empty `phases` means "suits any", so it counts toward every phase.
    """
    active = [r for r in recipes if r.get("is_active")]
    warnings: list[str] = []

    for slot in MEAL_TYPES:
        n = sum(1 for r in active if slot in (r.get("meal_types") or []))
        if n == 0:
            warnings.append(f"{slot.title()} has no active recipes — the rail needs at least 2.")
        elif n < 2:
            warnings.append(f"{slot.title()} has only 1 active recipe — the rail needs at least 2.")

    for phase in PHASES:
        n = sum(1 for r in active if not r.get("phases") or phase in r["phases"])
        if n < 1:
            warnings.append(f"No active recipe suits the {phase} phase — its rail would never appear.")

    return warnings


# --- programme validation --------------------------------------------------


def validate_tempo(raw: str | None) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    if not TEMPO_RE.match(value):
        raise ValidationError(
            [f"Tempo '{value}' must be four hyphen-separated counts, e.g. 3-1-1-0"]
        )
    return value


def day_id(programme_id: str, day_index: int) -> str:
    """`programme_days.id` is `<programme_id>-d<day_index>` by convention in
    the seed migration, and the app's queries rely on it."""
    return f"{programme_id}-d{day_index}"


def programme_gaps(days: list[dict[str, Any]], exercises: list[dict[str, Any]]) -> list[str]:
    """Variants that are missing work a sibling variant has.

    Someone following the bodyweight track must get the same session shape as
    someone in a gym. This is the check a row-based table editor cannot make.
    """
    warnings: list[str] = []
    by_day: dict[str, dict[str, set[tuple[int, str]]]] = {}
    for row in exercises:
        day = row["programme_day_id"]
        by_day.setdefault(day, {v: set() for v in VARIANTS})
        by_day[day][row["variant"]].add((row["block"], row["section"]))

    for day in days:
        slots = by_day.get(day["id"])
        if not slots:
            warnings.append(f"Day {day['day_index']} ({day['focus']}) has no exercises at all.")
            continue
        union = set().union(*slots.values())
        for variant in VARIANTS:
            missing = union - slots[variant]
            if not slots[variant]:
                warnings.append(
                    f"Day {day['day_index']} ({day['focus']}): the {variant} variant is empty."
                )
            elif missing:
                described = ", ".join(f"block {b} {s}" for b, s in sorted(missing))
                warnings.append(
                    f"Day {day['day_index']} ({day['focus']}): {variant} is missing {described}."
                )
    return warnings
