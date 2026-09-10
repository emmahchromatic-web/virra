#!/usr/bin/env python3
"""End-to-end checks: every page renders, every save path does what it says.

    tools/admin/.venv/bin/python tools/admin/smoketest.py

Runs against the in-memory store in fixtures.py, so it needs no key and cannot
touch production. selftest.py covers the rules in isolation; this covers the
routes, the forms and the writes.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import fixtures  # noqa: E402

STORE = fixtures.install()

from fastapi.testclient import TestClient  # noqa: E402

from admin.app import app  # noqa: E402
from admin.config import config  # noqa: E402

client = TestClient(app)
failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  {'ok  ' if ok else 'FAIL'} {name}" + (f"  {detail}" if not ok and detail else ""))
    if not ok:
        failures.append(name)


def get(path: str, *must: str) -> None:
    response = client.get(path)
    missing = [m for m in must if m not in response.text]
    check(f"GET {path}", response.status_code == 200 and not missing,
          f"[{response.status_code}] missing {missing}")


def post(path: str, data: dict, expect: int = 303, *must: str) -> None:
    response = client.post(path, data=data, follow_redirects=False)
    missing = [m for m in must if m not in response.text]
    check(f"POST {path}", response.status_code == expect and not missing,
          f"[{response.status_code}, wanted {expect}] missing {missing}")


from admin import db as db_module  # noqa: E402

print("\npages render")
get("/", "Wants attention", "Export recipes.sql", "Tables this tool can touch")
get("/recipes", "Biscoff Overnight Oats", "Fruity Cous Cous", "Quick wins")
get("/recipes/biscoff-overnight-oats", "Rolled oats", "Chill overnight", "computed")
get("/recipes/new", "New recipe", "blank = end of collection")
get("/recipes/biscoff-overnight-oats/delete", "cannot be undone")
get("/recipes/nope", "was not found")
get("/programmes", "Push / Pull / Legs", "Run programmes are not here")
get("/programmes/get-strong-ppl", "Push", "Pull", "Variant gaps")
get("/programmes/get-strong-ppl/days/1", "barbell-box-squat", "bodyweight")
get("/exercises", "Barbell Box Squat", "Used by", "Push-up")

print("\nwarnings are surfaced")
listing = client.get("/recipes").text
check("thin meal slots are flagged", "has only 1 active recipe" in listing or "has no active" in listing)
detail = client.get("/programmes/get-strong-ppl").text
check("empty and partial variants both flagged",
      "bodyweight variant is empty" in detail and "dumbbells is missing" in detail)

print("\nvalidation refuses bad input")
post("/recipes/new", {"name": "No meal slot", "serves": "1"}, 200, "at least one meal type")
post("/recipes/new", {"name": "Bad tag", "serves": "1", "meal_types": "brunch"}, 200, "not one of")
post("/programmes/get-strong-ppl/days/1",
     {"variant": "gym", "ex-0-exercise_id": "push-up", "ex-0-block": "1",
      "ex-0-section": "strength", "ex-0-tempo": "3-1-1"}, 200, "four hyphen-separated counts")
post("/programmes/get-strong-ppl/days/1",
     {"variant": "gym", "ex-0-exercise_id": "nope", "ex-0-block": "1",
      "ex-0-section": "strength"}, 200, "not in the exercise catalogue")
post("/exercises/save", {"name": "Bad tempo", "default_tempo": "2-2-2"}, 200,
     "four hyphen-separated counts")
post("/recipes/fruity-cous-cous/delete", {"confirm_id": "wrong"}, 200, "did not match")

print("\nan incomplete recipe cannot be activated, by either route")
post("/recipes/fruity-cous-cous/active", {"active": "1"}, 200,
     "needs at least one ingredient", "needs an intro", "not ready")

print("\nsaving recomputes the macros from the ingredients")
post("/recipes/biscoff-overnight-oats", {
    "name": "Biscoff Overnight Oats", "id": "biscoff-overnight-oats", "collection": "quick",
    "collection_label": "Quick wins", "intro": "Make it the night before.",
    "meal_types": ["breakfast", "snack"], "phases": ["luteal"], "serves": "2",
    "is_active": "1", "source": "virra-authored", "sort_order": "10",
    "ing-0-food_name": "Rolled oats", "ing-0-quantity": "80", "ing-0-unit": "g",
    "ing-0-calories": "300", "ing-0-carbs_g": "50", "ing-0-protein_g": "10",
    "ing-0-fat_g": "5", "ing-0-fibre_g": "6",
    "ing-1-food_name": "Milk", "ing-1-quantity": "200", "ing-1-unit": "ml",
    "ing-1-calories": "100", "ing-1-carbs_g": "10", "ing-1-protein_g": "20",
    "ing-1-fat_g": "1", "ing-1-fibre_g": "0",
    "step-0-body": "Stir together.", "step-1-body": "Chill.", "step-1-timer_seconds": "28800",
})
saved = [r for r in STORE["recipes"] if r["id"] == "biscoff-overnight-oats"][0]
check("per-serving totals", saved["calories"] == 200.0 and saved["protein_g"] == 15.0,
      f"got {saved['calories']}/{saved['protein_g']}")
check("tags updated", saved["phases"] == ["luteal"], f"got {saved['phases']}")
check("children rewritten",
      len(STORE["recipe_ingredients"]) == 2 and len(STORE["recipe_steps"]) == 2)
check("step timer kept", STORE["recipe_steps"][1]["timer_seconds"] == 28800)

print("\nsort_order")
post("/recipes/new", {
    "name": "End of shelf", "collection": "quick", "collection_label": "Quick wins",
    "meal_types": "lunch", "serves": "1", "sort_order": "",
    "calories": "300", "carbs_g": "40", "protein_g": "10", "fat_g": "5", "fibre_g": "",
})
added = [r for r in STORE["recipes"] if r["id"] == "end-of-shelf"][0]
check("blank goes ten past the last on that shelf", added["sort_order"] == 30,
      f"got {added['sort_order']}")
post("/recipes/new", {
    "name": "Top of shelf", "collection": "quick", "collection_label": "Quick wins",
    "meal_types": "lunch", "serves": "1", "sort_order": "0",
    "calories": "300", "carbs_g": "40", "protein_g": "10", "fat_g": "5", "fibre_g": "",
})
pinned = [r for r in STORE["recipes"] if r["id"] == "top-of-shelf"][0]
check("an explicit 0 is honoured, not auto-filled", pinned["sort_order"] == 0,
      f"got {pinned['sort_order']}")

print("\ncollections")
# The bug this replaced: a blank collection silently fell back to
# 'general'/'General', so a recipe landed on a shelf that did not exist.
post("/recipes/new", {
    "name": "No shelf", "meal_types": "lunch", "serves": "1",
    "calories": "1", "carbs_g": "1", "protein_g": "1", "fat_g": "1", "fibre_g": "",
}, 200, "Pick a collection")

post("/recipes/new", {
    "name": "New shelf", "collection": "__new__",
    "new_collection_label": "Sunday batch cooking",
    "meal_types": "lunch", "serves": "1", "sort_order": "",
    "calories": "1", "carbs_g": "1", "protein_g": "1", "fat_g": "1", "fibre_g": "",
})
fresh = [r for r in STORE["recipes"] if r["id"] == "new-shelf"]
check("a new collection is slugged from its name",
      fresh and fresh[0]["collection"] == "sunday-batch-cooking"
      and fresh[0]["collection_label"] == "Sunday batch cooking",
      f"got {fresh}")

# The label is taken from what is stored, so a mistyped one cannot split a shelf.
post("/recipes/new", {
    "name": "Label drift", "collection": "quick", "collection_label": "QUICK WINS!!",
    "meal_types": "lunch", "serves": "1", "sort_order": "",
    "calories": "1", "carbs_g": "1", "protein_g": "1", "fat_g": "1", "fibre_g": "",
})
drifted = [r for r in STORE["recipes"] if r["id"] == "label-drift"]
check("an existing shelf keeps its stored label",
      drifted and drifted[0]["collection_label"] == "Quick wins",
      f"got {drifted[0]['collection_label'] if drifted else None}")

print("\ningredient units")
from admin import validators  # noqa: E402

for unit in validators.UNITS:
    post("/recipes/new", {
        "name": f"Unit {unit}", "collection": "quick", "collection_label": "Quick wins",
        "meal_types": "lunch", "serves": "1", "sort_order": "",
        "calories": "100", "carbs_g": "1", "protein_g": "1", "fat_g": "1", "fibre_g": "",
        "ing-0-food_name": "Vanilla extract", "ing-0-quantity": "1", "ing-0-unit": unit,
        "step-0-body": "Stir.",
    })
    saved = [r for r in STORE["recipe_ingredients"] if r["recipe_id"] == f"unit-{unit}"]
    check(f"'{unit}' is stored as authored", saved and saved[0]["unit"] == unit,
          f"got {saved[0]['unit'] if saved else 'nothing'}")

post("/recipes/new", {
    "name": "Bad unit", "collection": "quick", "collection_label": "Quick wins",
    "meal_types": "lunch", "serves": "1",
    "ing-0-food_name": "Flour", "ing-0-quantity": "1", "ing-0-unit": "cups",
}, 200, "unit must be one of")

print("\nmacro auto-fill from the food catalogue")
from admin import foods  # noqa: E402

oats = foods.resolve("Rolled / porridge oats, dry")
check("the catalogue parses", oats is not None and oats["serving_g"] == 100)
check("scaling uses serving_g, not a hardcoded 100",
      foods.scale({"serving_g": 50, "calories": 100, "carbs_g": None, "protein_g": 0,
                   "fat_g": 0, "fibre_g": 0}, 25)["calories"] == 50.0)

post("/recipes/new", {
    "name": "Autofilled", "collection": "quick", "collection_label": "Quick wins",
    "meal_types": "breakfast", "serves": "1", "sort_order": "",
    "ing-0-food_name": "Oats", "ing-0-quantity": "80", "ing-0-unit": "g",
    "ing-0-common_food_id": "Rolled / porridge oats, dry",
    "step-0-body": "Stir.",
})
filled = [r for r in STORE["recipe_ingredients"] if r["recipe_id"] == "autofilled"]
expected = foods.scale(oats, 80)
check("blank macros are filled from the catalogue",
      filled and filled[0]["calories"] == expected["calories"], f"got {filled}")
check("the catalogue id is stored, not the label",
      filled and filled[0]["common_food_id"] == oats["id"],
      f"got {filled[0]['common_food_id'] if filled else None}")

post("/recipes/new", {
    "name": "Hand typed", "collection": "quick", "collection_label": "Quick wins",
    "meal_types": "breakfast", "serves": "1", "sort_order": "",
    "ing-0-food_name": "Oats", "ing-0-quantity": "80", "ing-0-unit": "g",
    "ing-0-common_food_id": "Rolled / porridge oats, dry", "ing-0-calories": "999",
    "step-0-body": "Stir.",
})
typed = [r for r in STORE["recipe_ingredients"] if r["recipe_id"] == "hand-typed"]
check("a typed macro is never overwritten", typed and typed[0]["calories"] == 999.0,
      f"got {typed[0]['calories'] if typed else None}")
check("the other blanks are still filled", typed and typed[0]["protein_g"] == expected["protein_g"])

post("/recipes/new", {
    "name": "Spoon fill", "collection": "quick", "collection_label": "Quick wins",
    "meal_types": "breakfast", "serves": "1",
    "ing-0-food_name": "Oats", "ing-0-quantity": "1", "ing-0-unit": "tsp",
    "ing-0-common_food_id": "Rolled / porridge oats, dry",
}, 200, "only be filled in from the catalogue for a quantity in g or ml")

post("/recipes/new", {
    "name": "Unknown food", "collection": "quick", "collection_label": "Quick wins",
    "meal_types": "breakfast", "serves": "1",
    "ing-0-food_name": "Unobtainium", "ing-0-quantity": "10", "ing-0-unit": "g",
    "ing-0-common_food_id": "Not A Real Food",
}, 200, "is not in the food catalogue")

print("\nfibre: blank stays unknown, never zero")
check("fibre is None", added["fibre_g"] is None, f"got {added['fibre_g']!r}")
check("the other macros are kept", added["calories"] == 300.0)

print("\na programme save re-derives its plan-picker row")
post("/programmes/get-strong-ppl", {
    "name": "Push / Pull (2-Day)", "id": "get-strong-ppl", "family": "get_strong",
    "family_label": "Get Strong", "days_per_week": "2", "duration_weeks": "8",
    "short_description": "Two days.", "full_description": "An eight-week build.",
    "is_active": "1", "day-0-focus": "Push", "day-0-day_index": "1",
    "day-1-focus": "Hinge", "day-1-day_index": "2",
})
template = [t for t in STORE["plan_templates"] if t["programme_id"] == "get-strong-ppl"][0]
check("name follows the programme", template["name"] == "Push / Pull (2-Day)")
check("tagline follows short_description", template["tagline"] == "Two days.")
check("weeks follow duration",
      template["duration_weeks"] == 8 and len(template["sessions_json"]) == 8)
check("a day focus change reaches the template",
      template["sessions_json"][0]["sessions"] == ["Push", "Hinge"])

print("\ndeactivating a programme pulls it out of the picker")
client.post("/programmes/get-strong-ppl/active", data={"active": "0"}, follow_redirects=False)
check("derived template removed",
      not [t for t in STORE["plan_templates"] if t["programme_id"] == "get-strong-ppl"])

print("\nday count must match days_per_week")
post("/programmes/get-strong-ppl", {
    "name": "Push / Pull", "id": "get-strong-ppl", "days_per_week": "3",
    "duration_weeks": "8", "day-0-focus": "Push", "day-0-day_index": "1",
}, 200, "but 1 day(s) are defined")

print("\na hard delete needs the exact id")
post("/recipes/end-of-shelf/delete", {"confirm_id": "end-of-shelf"})
check("deleted when the id matches",
      not [r for r in STORE["recipes"] if r["id"] == "end-of-shelf"])

print("\nread-only mode blocks writes")
config.readonly = True
response = client.post("/recipes/biscoff-overnight-oats/active",
                       data={"active": "0"}, follow_redirects=False)
check("write refused with an explanation",
      response.status_code == 200 and "READONLY" in response.text.upper())
config.readonly = False

print("\nthe allowlist holds")
from admin import db  # noqa: E402

try:
    db.select("user_profiles")
    check("user_profiles is unreachable", False, "it was reachable")
except Exception as error:  # noqa: BLE001
    check("user_profiles is unreachable", "not in the admin allowlist" in str(error))

print()
if failures:
    print(f"{len(failures)} FAILED: {', '.join(failures)}\n")
    raise SystemExit(1)
print("smoketest: all passed\n")
