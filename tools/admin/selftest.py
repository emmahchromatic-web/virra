#!/usr/bin/env python3
"""Checks for the rules that would otherwise only fail against production.

    tools/admin/.venv/bin/python tools/admin/selftest.py

Pure logic only — no network, no database, no key needed.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from admin import derive, export, forms, validators  # noqa: E402
from admin.validators import ValidationError  # noqa: E402

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  ok   {name}")
    else:
        print(f"  FAIL {name} {detail}")
        failures.append(name)


def raises(name: str, fn) -> None:
    try:
        fn()
    except ValidationError:
        print(f"  ok   {name}")
        return
    print(f"  FAIL {name} (no ValidationError)")
    failures.append(name)


print("\nvalidators")
check("slugify matches the seeded id style", validators.slugify("World's Greatest Stretch!") == "world-s-greatest-stretch")
check("tempo accepts four counts", validators.validate_tempo("3-1-1-0") == "3-1-1-0")
check("blank tempo is null, not a value", validators.validate_tempo("  ") is None)
raises("tempo rejects three counts", lambda: validators.validate_tempo("3-1-1"))
raises("tempo rejects prose", lambda: validators.validate_tempo("slow"))
raises("subset_of rejects an unknown phase", lambda: validators.subset_of(["lunar"], validators.PHASES, "Phases"))
check("subset_of de-duplicates but keeps order",
      validators.subset_of(["lunch", "breakfast", "lunch"], validators.MEAL_TYPES, "m") == ["lunch", "breakfast"])
check("blank number is None, never 0", validators.to_number("", "fibre_g") is None)
check("day_id follows the seed convention", validators.day_id("get-strong-ppl", 2) == "get-strong-ppl-d2")

print("\nmacro derivation")
ingredients = [
    {"calories": 300, "carbs_g": 50, "protein_g": 10, "fat_g": 5, "fibre_g": 6},
    {"calories": 100, "carbs_g": 10, "protein_g": 20, "fat_g": 1, "fibre_g": 0},
]
derived = validators.derive_macros(ingredients, serves=2)
check("totals are per serving", derived["calories"] == 200.0, f"got {derived['calories']}")
check("protein per serving", derived["protein_g"] == 15.0, f"got {derived['protein_g']}")

partial = [dict(ingredients[0]), {**ingredients[1], "fibre_g": None}]
partial_derived = validators.derive_macros(partial, serves=2)
check("a missing fibre figure makes fibre underivable, not undercounted", partial_derived["fibre_g"] is None)
check("the other macros still derive", partial_derived["calories"] == 200.0)
check("no ingredients derives nothing", all(v is None for v in validators.derive_macros([], 1).values()))

drift = validators.macro_drift({"calories": 250, "protein_g": 15.0}, derived)
check("drift is caught", "calories" in drift, f"got {drift}")
check("agreement is not reported as drift", "protein_g" not in drift)
check("a null stored macro counts as drift", "carbs_g" in validators.macro_drift({"carbs_g": None}, derived))

print("\ncontent invariants")
one_breakfast = [
    {"is_active": True, "meal_types": ["breakfast"], "phases": []},
    {"is_active": True, "meal_types": ["lunch", "dinner", "snack"], "phases": []},
    {"is_active": True, "meal_types": ["lunch", "dinner", "snack"], "phases": []},
]
warnings = validators.recipe_coverage_warnings(one_breakfast)
check("a lone breakfast is flagged", any("Breakfast" in w for w in warnings), f"got {warnings}")
check("empty phases counts as covering every phase", not any("phase" in w for w in warnings), f"got {warnings}")
check("inactive recipes do not count",
      len(validators.recipe_coverage_warnings([{**one_breakfast[1], "is_active": False}])) >= 4)

print("\nprogramme gaps")
days = [{"id": "p-d1", "day_index": 1, "focus": "Push"}]
rows = [
    {"programme_day_id": "p-d1", "variant": "gym", "block": 1, "section": "strength"},
    {"programme_day_id": "p-d1", "variant": "gym", "block": 2, "section": "accessory"},
    {"programme_day_id": "p-d1", "variant": "dumbbells", "block": 1, "section": "strength"},
]
gaps = validators.programme_gaps(days, rows)
check("an empty bodyweight variant is flagged", any("bodyweight" in g and "empty" in g for g in gaps), f"got {gaps}")
check("a partial dumbbells variant is flagged", any("dumbbells is missing" in g for g in gaps), f"got {gaps}")
check("a complete variant is not flagged", not any(g.startswith("Day 1 (Push): gym") for g in gaps))

print("\nplan template derivation")
sessions = derive.build_sessions_json(
    {"duration_weeks": 12}, [{"day_index": 2, "focus": "Pull"}, {"day_index": 1, "focus": "Push"}]
)
check("one entry per week", len(sessions) == 12)
check("focuses are in day order", sessions[0]["sessions"] == ["Push", "Pull"])
check("week 4 is a deload", sessions[3]["label"] == "Deload")
check("week 1 is base", sessions[0]["label"] == "Base")
check("week 12 is a deload", sessions[11]["label"] == "Deload")

print("\nform parsing")
form = {
    "ing-0-food_name": "Oats", "ing-0-quantity": "80", "ing-0-unit": "g",
    "ing-1-food_name": "", "ing-1-quantity": "",
    "ing-2-food_name": "Milk", "ing-2-quantity": "200", "ing-2-unit": "ml",
}
rows = forms.rows_from(form, "ing", ["food_name", "quantity", "unit"])
check("blank groups are dropped", len(rows) == 2, f"got {rows}")
check("order is preserved", [r["food_name"] for r in rows] == ["Oats", "Milk"])
check("blank stays null, not empty string", forms.optional_text({"intro": "  "}, "intro") is None)

print("\nSQL literals")
check("quotes are escaped", export.sql_literal("Emma's") == "'Emma''s'")
check("None is null", export.sql_literal(None) == "null")
check("empty array keeps its type", export.sql_literal([]) == "'{}'::text[]")
check("text arrays quote each element", export.sql_literal(["a", "b"]) == '\'{"a","b"}\'::text[]')
check("a comma inside a tag cannot break out", export.sql_literal(["a,b"]) == '\'{"a,b"}\'::text[]')
check("booleans are unquoted", export.sql_literal(True) == "true")
check("jsonb for dicts", export.sql_literal({"week": 1}).endswith("::jsonb"))

print("\nallowlist")
from admin import config as config_module  # noqa: E402

for table in ("activities", "cycle_logs", "user_profiles", "food_entries", "strength_set_logs", "subscriptions"):
    check(f"{table} is NOT reachable", table not in config_module.ALLOWLIST)
check("8 content tables are allowed", len(config_module.ALLOWLIST) == 8, f"got {len(config_module.ALLOWLIST)}")

print()
if failures:
    print(f"{len(failures)} FAILED: {', '.join(failures)}\n")
    raise SystemExit(1)
print("all checks passed\n")
