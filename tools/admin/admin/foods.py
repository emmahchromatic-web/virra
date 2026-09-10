"""The app's own food catalogue, read straight from the TypeScript source.

`mobile/src/lib/commonFoods.ts` is what the app searches when a user logs food.
Authoring a recipe's ingredients against the same numbers is the whole point of
`recipe_ingredients.common_food_id`: it is what makes a recipe's macros agree
with what the same food logs as through search.

Parsed rather than duplicated, so the two cannot drift. The file is one object
literal per line, and the parse asserts it found every entry it expected — a
regex that silently stopped matching would otherwise turn auto-fill into a
quiet no-op.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

from .config import REPO_ROOT

SOURCE = REPO_ROOT / "mobile" / "src" / "lib" / "commonFoods.ts"

_ENTRY = re.compile(r"^\s*\{\s*id:\s*'")
_STR = r"{key}:\s*'((?:[^'\\]|\\.)*)'"
_NUM = r"{key}:\s*(-?[0-9]+(?:\.[0-9]+)?)"

MACROS = ("calories", "carbs_g", "protein_g", "fat_g", "fibre_g")


class CatalogueError(RuntimeError):
    pass


def _text(line: str, key: str) -> str | None:
    match = re.search(_STR.format(key=key), line)
    return match.group(1).replace("\\'", "'") if match else None


def _number(line: str, key: str) -> float | None:
    match = re.search(_NUM.format(key=key), line)
    return float(match.group(1)) if match else None


@lru_cache(maxsize=1)
def catalogue() -> list[dict[str, Any]]:
    if not SOURCE.exists():
        return []

    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    expected = sum(1 for line in lines if _ENTRY.match(line))

    foods: list[dict[str, Any]] = []
    for line in lines:
        if not _ENTRY.match(line):
            continue
        food_id = _text(line, "id")
        name = _text(line, "name")
        serving = _number(line, "serving_g")
        if not food_id or not name or not serving:
            continue
        food = {
            "id": food_id,
            "name": name,
            "detail": _text(line, "detail"),
            "unit": _text(line, "unit") or "g",
            "serving_g": serving,
        }
        for macro in MACROS:
            food[macro] = _number(line, macro)
        foods.append(food)

    if expected and len(foods) < expected:
        raise CatalogueError(
            f"Parsed {len(foods)} of {expected} foods from {SOURCE.name}. "
            "The file's shape has changed and the parser needs updating; "
            "auto-fill would otherwise silently cover only part of the catalogue."
        )
    return foods


def by_id(food_id: str) -> dict[str, Any] | None:
    return next((f for f in catalogue() if f["id"] == food_id), None)


def label(food: dict[str, Any]) -> str:
    return f"{food['name']}, {food['detail']}" if food.get("detail") else food["name"]


def scale(food: dict[str, Any], quantity: float) -> dict[str, float | None]:
    """That food's macros for `quantity` of it.

    Macros in the catalogue are per `serving_g`, which is NOT always 100 — it
    ranges from 10 (a teaspoon of oil) to 200. Dividing by 100 would be wrong
    for a fifth of the catalogue.
    """
    serving = float(food.get("serving_g") or 0)
    if serving <= 0:
        return {macro: None for macro in MACROS}
    factor = quantity / serving
    return {
        macro: (None if food.get(macro) is None else round(float(food[macro]) * factor, 1))
        for macro in MACROS
    }


def resolve(value: str) -> dict[str, Any] | None:
    """Find a food by its id or by the label the form shows.

    The picker submits the label, because "Rolled / porridge oats, dry" is what
    Emma can type and `rolled-porridge-oats-dry` is not. Labels are unique
    across the catalogue, which is asserted by the tests.
    """
    needle = (value or "").strip().lower()
    if not needle:
        return None
    for food in catalogue():
        if food["id"].lower() == needle or label(food).lower() == needle:
            return food
    return None
