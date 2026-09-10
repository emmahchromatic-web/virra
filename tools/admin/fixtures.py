"""An in-memory stand-in for Supabase, so the console can be exercised end to
end without a service_role key and without touching production.

`install()` swaps the functions in admin.db for ones backed by a dict. It
implements only what the console actually calls — `eq.` filters, ordering,
limit — and raises on anything else rather than quietly returning the wrong
rows. ON DELETE CASCADE is emulated for the two parent tables that have it.

Used by smoketest.py. Never imported by the running console.
"""

from __future__ import annotations

import base64
import json
import os
import tempfile
from pathlib import Path
from typing import Any


def _jwt(role: str) -> str:
    def seg(d: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    return f"{seg({'alg': 'HS256'})}.{seg({'role': role})}.not-a-real-signature"


def _seed() -> dict[str, list[dict[str, Any]]]:
    return {
        "recipes": [
            dict(id="biscoff-overnight-oats", name="Biscoff Overnight Oats", collection="quick",
                 collection_label="Quick wins", intro="Make it the night before.",
                 meal_types=["breakfast", "snack"], phases=["follicular", "luteal"], loads=[],
                 dietary=["vegetarian"], serves=2, prep_minutes=5, cook_minutes=None,
                 image_url=None, min_tier=None, source="virra-authored", calories=200.0,
                 carbs_g=30.0, protein_g=15.0, fat_g=3.0, fibre_g=3.0, sort_order=10,
                 is_active=True),
            dict(id="fruity-cous-cous", name="Fruity Cous Cous", collection="quick",
                 collection_label="Quick wins", intro=None, meal_types=["lunch", "dinner"],
                 phases=[], loads=["easy"], dietary=["vegan"], serves=1, prep_minutes=10,
                 cook_minutes=5, image_url=None, min_tier=None, source="virra-authored",
                 calories=410.0, carbs_g=70.0, protein_g=12.0, fat_g=6.0, fibre_g=None,
                 sort_order=20, is_active=False),
        ],
        "recipe_ingredients": [
            dict(id=1, recipe_id="biscoff-overnight-oats", position=1, group_label=None,
                 food_name="Rolled oats", quantity=80.0, unit="g", note=None,
                 common_food_id="oats", calories=300.0, carbs_g=50.0, protein_g=10.0,
                 fat_g=5.0, fibre_g=6.0),
            dict(id=2, recipe_id="biscoff-overnight-oats", position=2, group_label=None,
                 food_name="Semi-skimmed milk", quantity=200.0, unit="ml", note=None,
                 common_food_id=None, calories=100.0, carbs_g=10.0, protein_g=20.0,
                 fat_g=1.0, fibre_g=0.0),
        ],
        "recipe_steps": [
            dict(id=1, recipe_id="biscoff-overnight-oats", position=1,
                 body="Stir the oats and milk together in a jar.", timer_seconds=None),
            dict(id=2, recipe_id="biscoff-overnight-oats", position=2,
                 body="Chill overnight.", timer_seconds=28800),
        ],
        "exercises": [
            dict(id="barbell-box-squat", name="Barbell Box Squat",
                 description="Squat back to a box.", load_type="weighted", default_tempo="3-1-1-0"),
            dict(id="push-up", name="Push-up", description="Lower the chest to the floor.",
                 load_type="none", default_tempo=None),
            dict(id="hollow-hold", name="Hollow Hold", description="Press the low back down.",
                 load_type="none", default_tempo=None),
        ],
        "programmes": [
            dict(id="get-strong-ppl", family="get_strong", family_label="Get Strong",
                 name="Push / Pull / Legs (3-Day)", sport_type="strength", days_per_week=2,
                 duration_weeks=12, short_description="Three days, three patterns.",
                 full_description="A twelve-week push/pull/legs build.",
                 deload_note="Week 4 is a deload.", sort_order=1, is_active=True),
        ],
        "programme_days": [
            dict(id="get-strong-ppl-d1", programme_id="get-strong-ppl", day_index=1,
                 focus="Push", sort_order=1),
            dict(id="get-strong-ppl-d2", programme_id="get-strong-ppl", day_index=2,
                 focus="Pull", sort_order=2),
        ],
        "programme_exercises": [
            dict(id=1, programme_day_id="get-strong-ppl-d1", variant="gym", block=1,
                 section="strength", position=1, exercise_id="barbell-box-squat", sets=4,
                 reps="6", tempo="3-1-1-0", rest="120s"),
            dict(id=2, programme_day_id="get-strong-ppl-d1", variant="gym", block=2,
                 section="accessory", position=1, exercise_id="hollow-hold", sets=3,
                 reps="30s", tempo=None, rest="60s"),
            dict(id=3, programme_day_id="get-strong-ppl-d1", variant="dumbbells", block=1,
                 section="strength", position=1, exercise_id="push-up", sets=4, reps="8",
                 tempo=None, rest="120s"),
        ],
        "plan_templates": [
            dict(id="tmpl-1", name="Push / Pull / Legs (3-Day)", sport_type="strength",
                 duration_weeks=12, description="A twelve-week push/pull/legs build.",
                 tagline="Three days, three patterns.", sort_order=1,
                 programme_id="get-strong-ppl", is_active=True,
                 sessions_json=[{"week": 1, "km": 0, "label": "Base",
                                 "sessions": ["Push", "Pull"]}]),
        ],
    }


def install() -> dict[str, list[dict[str, Any]]]:
    """Point admin.db at an in-memory store. Returns the store."""
    os.environ.setdefault("SUPABASE_URL", "https://fixture.supabase.co")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", _jwt("service_role"))
    os.environ["ADMIN_READONLY"] = "0"

    from admin import audit, db

    # The audit log is a real file in the real changes/ directory. Without this
    # every test run writes entries for recipes that were never saved, which
    # makes the log answer "what did I change today" with fiction.
    audit.CHANGES_DIR = Path(tempfile.mkdtemp(prefix="virra-admin-fixture-")) / "changes"

    store = _seed()

    def matches(row: dict, filters: dict) -> bool:
        for key, expr in filters.items():
            op, _, value = str(expr).partition(".")
            if op != "eq":
                raise AssertionError(f"fixture does not implement the '{op}' operator")
            if str(row.get(key)) != value:
                return False
        return True

    def select(table, *, columns="*", order=None, limit=None, **filters):
        db._check(table, write=False)
        rows = [dict(r) for r in store.get(table, []) if matches(r, filters)]
        if order:
            for key in reversed([k.strip() for k in order.split(",")]):
                rows.sort(key=lambda r: (r.get(key) is None, r.get(key)))
        return rows[:limit] if limit else rows

    def select_one(table, **filters):
        rows = select(table, **filters)
        return rows[0] if rows else None

    def count(table, **filters):
        return len(select(table, **filters))

    def insert(table, rows):
        db._check(table, write=True)
        rows = rows if isinstance(rows, list) else [rows]
        out = []
        for row in rows:
            stored = dict(row)
            if "id" not in stored:
                ints = [r["id"] for r in store.get(table, []) if isinstance(r.get("id"), int)]
                stored["id"] = max(ints, default=0) + 1
            store.setdefault(table, []).append(stored)
            out.append(stored)
        return out

    def upsert(table, rows):
        db._check(table, write=True)
        rows = rows if isinstance(rows, list) else [rows]
        out = []
        for row in rows:
            bucket = store.setdefault(table, [])
            for index, existing in enumerate(bucket):
                if existing.get("id") == row.get("id"):
                    bucket[index] = {**existing, **row}
                    out.append(bucket[index])
                    break
            else:
                bucket.append(dict(row))
                out.append(bucket[-1])
        return out

    def update(table, patch, **filters):
        db._check(table, write=True)
        assert filters, "unfiltered update"
        out = []
        for row in store.get(table, []):
            if matches(row, filters):
                row.update(patch)
                out.append(row)
        return out

    def delete(table, **filters):
        db._check(table, write=True)
        assert filters, "unfiltered delete"
        removed = [r for r in store.get(table, []) if matches(r, filters)]
        store[table] = [r for r in store.get(table, []) if not matches(r, filters)]
        # ON DELETE CASCADE, as the schema declares it.
        for row in removed:
            if table == "recipes":
                for child in ("recipe_ingredients", "recipe_steps"):
                    store[child] = [c for c in store[child] if c["recipe_id"] != row["id"]]
            elif table == "programme_days":
                store["programme_exercises"] = [
                    c for c in store["programme_exercises"]
                    if c["programme_day_id"] != row["id"]
                ]

    def replace_children(table, parent_column, parent_id, rows):
        delete(table, **{parent_column: f"eq.{parent_id}"})
        return insert(table, rows) if rows else []

    for name, fn in [
        ("select", select), ("select_one", select_one), ("count", count),
        ("insert", insert), ("upsert", upsert), ("update", update),
        ("delete", delete), ("replace_children", replace_children),
    ]:
        setattr(db, name, fn)

    return store
