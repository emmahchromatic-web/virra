"""Recipes: read, validate, save.

One recipe is three tables — `recipes` and its `recipe_ingredients` and
`recipe_steps` children — edited together on one screen, because a recipe whose
ingredients you cannot see is not a recipe you can check.
"""

from __future__ import annotations

from typing import Any

from . import audit, db, forms, validators
from .validators import MACROS, ValidationError

INGREDIENT_FIELDS = [
    "group_label",
    "food_name",
    "quantity",
    "unit",
    "note",
    "common_food_id",
    "calories",
    "carbs_g",
    "protein_g",
    "fat_g",
    "fibre_g",
]
STEP_FIELDS = ["body", "timer_seconds"]


def load(recipe_id: str) -> dict[str, Any] | None:
    recipe = db.select_one("recipes", id=f"eq.{recipe_id}")
    if recipe is None:
        return None
    recipe["ingredients"] = db.select(
        "recipe_ingredients", recipe_id=f"eq.{recipe_id}", order="position"
    )
    recipe["steps"] = db.select("recipe_steps", recipe_id=f"eq.{recipe_id}", order="position")
    return recipe


def list_all() -> list[dict[str, Any]]:
    return db.select("recipes", order="collection,sort_order,name")


def next_sort_order(collection: str, *, exclude_id: str | None = None) -> int:
    """Ten past the last recipe on that shelf.

    Spaced in tens so a recipe can be slotted between two later without
    renumbering the collection. Scoped to the collection, because the app
    orders by (collection, sort_order) and shelves sort independently.
    """
    rows = db.select("recipes", columns="id,sort_order", collection=f"eq.{collection}")
    used = [r["sort_order"] or 0 for r in rows if r["id"] != exclude_id]
    return (max(used) + 10) if used else 10


def blank() -> dict[str, Any]:
    return {
        "id": "",
        "name": "",
        "collection": "",
        "collection_label": "",
        "intro": None,
        "meal_types": [],
        "phases": [],
        "loads": [],
        "dietary": [],
        "serves": 1,
        "prep_minutes": None,
        "cook_minutes": None,
        "image_url": None,
        "min_tier": None,
        "source": "virra-authored",
        "sort_order": None,
        "is_active": False,
        "ingredients": [],
        "steps": [],
        **{macro: None for macro in MACROS},
    }


def parse(form: Any, *, existing_id: str | None) -> dict[str, Any]:
    """Form data -> the three row sets, with every CHECK constraint pre-checked."""
    problems: list[str] = []

    name = forms.text(form, "name")
    if not name:
        problems.append("Name is required.")

    recipe_id = forms.text(form, "id") or existing_id or validators.slugify(name)
    if not validators.slugify(recipe_id) == recipe_id:
        problems.append(f"Id '{recipe_id}' must be lowercase letters, numbers and hyphens.")

    serves = forms.integer(form, "serves", 1)
    if serves <= 0:
        problems.append("Serves must be at least 1.")

    try:
        meal_types = validators.subset_of(
            forms.checkboxes(form, "meal_types"), validators.MEAL_TYPES, "Meal types"
        )
    except ValidationError as error:
        problems.extend(error.problems)
        meal_types = []
    if not meal_types:
        problems.append("Pick at least one meal type — a recipe in no slot appears nowhere.")

    def tag_set(field: str, allowed: tuple[str, ...], label: str) -> list[str]:
        try:
            return validators.subset_of(forms.checkboxes(form, field), allowed, label)
        except ValidationError as error:
            problems.extend(error.problems)
            return []

    recipe = {
        "id": recipe_id,
        "name": name,
        "collection": forms.text(form, "collection") or "general",
        "collection_label": forms.text(form, "collection_label") or "General",
        "intro": forms.optional_text(form, "intro"),
        "meal_types": meal_types,
        "phases": tag_set("phases", validators.PHASES, "Phases"),
        "loads": tag_set("loads", validators.LOADS, "Loads"),
        "dietary": tag_set("dietary", validators.DIETARY, "Dietary"),
        "serves": serves,
        "prep_minutes": forms.integer(form, "prep_minutes", 0) or None,
        "cook_minutes": forms.integer(form, "cook_minutes", 0) or None,
        "image_url": forms.optional_text(form, "image_url"),
        "min_tier": forms.optional_text(form, "min_tier"),
        "source": forms.text(form, "source") or "virra-authored",
        "is_active": forms.flag(form, "is_active"),
    }

    # Left blank means "put it at the end of its shelf". An explicit 0 is
    # honoured, because 0 is a legitimate position and guessing over it would
    # be worse than a surprising default.
    if forms.text(form, "sort_order") == "":
        recipe["sort_order"] = next_sort_order(recipe["collection"], exclude_id=recipe_id)
    else:
        recipe["sort_order"] = forms.integer(form, "sort_order", 0)

    ingredients: list[dict[str, Any]] = []
    for position, raw in enumerate(forms.rows_from(form, "ing", INGREDIENT_FIELDS), start=1):
        if not raw["food_name"]:
            problems.append(f"Ingredient {position} has no food name.")
            continue
        if raw["unit"] and raw["unit"] not in validators.UNITS:
            problems.append(f"Ingredient {position}: unit must be g or ml.")
        row: dict[str, Any] = {
            "recipe_id": recipe_id,
            "position": position,
            "group_label": raw["group_label"] or None,
            "food_name": raw["food_name"],
            "unit": raw["unit"] or "g",
            "note": raw["note"] or None,
            "common_food_id": raw["common_food_id"] or None,
        }
        for field in ("quantity", *MACROS):
            try:
                row[field] = validators.to_number(raw[field], f"Ingredient {position} {field}")
            except ValidationError as error:
                problems.extend(error.problems)
                row[field] = None
        ingredients.append(row)

    steps: list[dict[str, Any]] = []
    for position, raw in enumerate(forms.rows_from(form, "step", STEP_FIELDS), start=1):
        if not raw["body"]:
            continue
        timer = None
        if raw["timer_seconds"]:
            try:
                timer = int(float(raw["timer_seconds"]))
            except ValueError:
                problems.append(f"Step {position}: timer must be a whole number of seconds.")
        steps.append(
            {
                "recipe_id": recipe_id,
                "position": position,
                "body": raw["body"],
                "timer_seconds": timer,
            }
        )

    # Macros: authored figures are what the app shows, but the ingredients are
    # the source of truth wherever they are complete, so a complete ingredient
    # list wins outright and the authored boxes are only read as a fallback.
    derived = validators.derive_macros(ingredients, serves)
    for macro in MACROS:
        if derived[macro] is not None:
            recipe[macro] = derived[macro]
        else:
            try:
                recipe[macro] = validators.to_number(forms.text(form, macro), macro)
            except ValidationError as error:
                problems.extend(error.problems)
                recipe[macro] = None

    # fibre_g is nullable by design (null means unknown, never zero). The other
    # four are `not null default 0` in the schema.
    for macro in ("calories", "carbs_g", "protein_g", "fat_g"):
        if recipe[macro] is None:
            recipe[macro] = 0

    if problems:
        raise ValidationError(problems)

    return {"recipe": recipe, "ingredients": ingredients, "steps": steps, "derived": derived}


def readiness(recipe: dict[str, Any], ingredients: list, steps: list) -> list[str]:
    """Reasons a recipe is not ready to be shown in the app.

    Decision C: an incomplete recipe can always be SAVED — staging a
    half-written one is the normal way to work — but never ACTIVATED. Both
    routes that can activate one (saving the form with the box ticked, and the
    Activate button on the list) run this, so there is no way round it.
    """
    blockers: list[str] = []
    if not ingredients:
        blockers.append("An active recipe needs at least one ingredient.")
    if not steps:
        blockers.append("An active recipe needs at least one method step.")
    if not recipe.get("intro"):
        blockers.append("An active recipe needs an intro — it is the most visible line on the card.")

    derived = validators.derive_macros(ingredients, recipe.get("serves") or 1)
    for macro, (stored, computed) in validators.macro_drift(recipe, derived).items():
        blockers.append(
            f"{macro}: stored {stored:g} but the ingredients give {computed:g}. "
            "Open the recipe and save it — that recomputes the stored figures."
        )
    return blockers


def activation_blockers(parsed: dict[str, Any]) -> list[str]:
    if not parsed["recipe"]["is_active"]:
        return []
    return readiness(parsed["recipe"], parsed["ingredients"], parsed["steps"])


def readiness_of_stored(recipe_id: str) -> list[str]:
    """The same check against what is actually in the database."""
    recipe = load(recipe_id)
    if recipe is None:
        return [f"'{recipe_id}' was not found."]
    return readiness(recipe, recipe["ingredients"], recipe["steps"])


def save(parsed: dict[str, Any], *, before: dict[str, Any] | None) -> dict[str, Any]:
    recipe = parsed["recipe"]
    recipe_id = recipe["id"]

    stored = db.upsert("recipes", recipe)
    db.replace_children("recipe_ingredients", "recipe_id", recipe_id, parsed["ingredients"])
    db.replace_children("recipe_steps", "recipe_id", recipe_id, parsed["steps"])

    audit.record(
        "update" if before else "create",
        "recipes",
        recipe_id,
        before=before,
        after={**recipe, "ingredients": len(parsed["ingredients"]), "steps": len(parsed["steps"])},
    )

    # Read back rather than trusting the write: the children are two separate
    # requests with no transaction around them, so a partial save has to be
    # visible on the page instead of assumed away.
    return load(recipe_id) or (stored[0] if stored else recipe)


def set_active(recipe_id: str, active: bool) -> None:
    before = db.select_one("recipes", id=f"eq.{recipe_id}")
    db.update("recipes", {"is_active": active}, id=f"eq.{recipe_id}")
    audit.record("activate" if active else "deactivate", "recipes", recipe_id, before=before)


def hard_delete(recipe_id: str) -> None:
    before = load(recipe_id)
    # Children cascade on delete in the schema, so this is one call.
    db.delete("recipes", id=f"eq.{recipe_id}")
    audit.record("delete", "recipes", recipe_id, before=before)
