"""Routes. Server-rendered forms; the only JavaScript is row add/remove.

Nothing here reaches the database directly — every read and write goes through
db.py so the allowlist and the read-only flag cannot be bypassed by a route
that forgot about them.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from . import audit, db, export, programmes, recipes, validators
from .config import ALLOWLIST, config
from .validators import ValidationError

HERE = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(HERE / "templates"))

app = FastAPI(title="VIRRA Admin Console", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=str(HERE / "static")), name="static")


def render(request: Request, template: str, **context: Any) -> HTMLResponse:
    return templates.TemplateResponse(
        request=request,
        name=template,
        context={"readonly": config.readonly, "v": validators, **context},
    )


def problem_page(request: Request, title: str, problems: list[str], back: str) -> HTMLResponse:
    return render(request, "error.html", title=title, problems=problems, back=back)


# --- dashboard -------------------------------------------------------------


@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request) -> HTMLResponse:
    all_recipes = recipes.list_all()
    all_programmes = programmes.list_all()
    programme_warnings: list[str] = []
    for programme in all_programmes:
        if programme["is_active"]:
            programme_warnings += [
                f"{programme['name']}: {gap}" for gap in programmes.gaps(programme["id"])
            ]
    return render(
        request,
        "index.html",
        recipes=all_recipes,
        programmes=all_programmes,
        recipe_warnings=validators.recipe_coverage_warnings(all_recipes),
        programme_warnings=programme_warnings,
        exercise_count=db.count("exercises"),
        changes=audit.recent(12),
        allowlist=sorted(ALLOWLIST),
        supabase_host=config.supabase_url.split("//")[-1],
    )


# --- recipes ---------------------------------------------------------------


@app.get("/recipes", response_class=HTMLResponse)
def recipe_list(request: Request) -> HTMLResponse:
    rows = recipes.list_all()
    collections: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        collections.setdefault(row.get("collection_label") or "Uncollected", []).append(row)
    return render(
        request,
        "recipes.html",
        collections=collections,
        warnings=validators.recipe_coverage_warnings(rows),
        total=len(rows),
    )


@app.get("/recipes/new", response_class=HTMLResponse)
def recipe_new(request: Request) -> HTMLResponse:
    return render(request, "recipe_edit.html", recipe=recipes.blank(), is_new=True, derived={}, drift={})


@app.get("/recipes/{recipe_id}", response_class=HTMLResponse)
def recipe_edit(request: Request, recipe_id: str) -> HTMLResponse:
    recipe = recipes.load(recipe_id)
    if recipe is None:
        return problem_page(request, "No such recipe", [f"'{recipe_id}' was not found."], "/recipes")
    derived = validators.derive_macros(recipe["ingredients"], recipe.get("serves") or 1)
    return render(
        request,
        "recipe_edit.html",
        recipe=recipe,
        is_new=False,
        derived=derived,
        drift=validators.macro_drift(recipe, derived),
    )


# Two explicit routes rather than stacked decorators: decorators register
# bottom-up, so a stacked `/recipes/{recipe_id}` would shadow `/recipes/new`.
@app.post("/recipes/new")
async def recipe_create(request: Request) -> Any:
    return await _recipe_save(request, None)


@app.post("/recipes/{recipe_id}")
async def recipe_update(request: Request, recipe_id: str) -> Any:
    return await _recipe_save(request, recipe_id)


async def _recipe_save(request: Request, recipe_id: str | None) -> Any:
    form = await request.form()
    before = recipes.load(recipe_id) if recipe_id else None
    try:
        parsed = recipes.parse(form, existing_id=recipe_id)
        blockers = recipes.activation_blockers(parsed)
        if blockers:
            raise ValidationError(blockers)
        stored = recipes.save(parsed, before=before)
    except (ValidationError, db.DbError, db.NotAllowed) as error:
        problems = getattr(error, "problems", None) or [str(error)]
        return problem_page(
            request,
            "That recipe was not saved",
            problems,
            f"/recipes/{recipe_id}" if recipe_id else "/recipes/new",
        )
    return RedirectResponse(f"/recipes/{stored['id']}?saved=1", status_code=303)


@app.post("/recipes/{recipe_id}/active")
async def recipe_active(request: Request, recipe_id: str) -> Any:
    form = await request.form()
    active = str(form.get("active", "")) == "1"
    if active:
        blockers = recipes.readiness_of_stored(recipe_id)
        if blockers:
            return problem_page(
                request, "Not activated — the recipe is not ready", blockers, f"/recipes/{recipe_id}"
            )
    try:
        recipes.set_active(recipe_id, active)
    except (db.DbError, db.NotAllowed) as error:
        return problem_page(request, "Could not change that", [str(error)], f"/recipes/{recipe_id}")
    return RedirectResponse("/recipes", status_code=303)


@app.get("/recipes/{recipe_id}/delete", response_class=HTMLResponse)
def recipe_delete_confirm(request: Request, recipe_id: str) -> HTMLResponse:
    recipe = recipes.load(recipe_id)
    if recipe is None:
        return problem_page(request, "No such recipe", [f"'{recipe_id}' was not found."], "/recipes")
    return render(request, "recipe_delete.html", recipe=recipe)


@app.post("/recipes/{recipe_id}/delete")
async def recipe_delete(request: Request, recipe_id: str) -> Any:
    form = await request.form()
    if str(form.get("confirm_id", "")).strip() != recipe_id:
        return problem_page(
            request,
            "Not deleted",
            ["The id you typed did not match. Nothing was changed."],
            f"/recipes/{recipe_id}/delete",
        )
    try:
        recipes.hard_delete(recipe_id)
    except (db.DbError, db.NotAllowed) as error:
        return problem_page(request, "Could not delete that", [str(error)], f"/recipes/{recipe_id}")
    return RedirectResponse("/recipes", status_code=303)


# --- programmes ------------------------------------------------------------


@app.get("/programmes", response_class=HTMLResponse)
def programme_list(request: Request) -> HTMLResponse:
    rows = programmes.list_all()
    return render(request, "programmes.html", programmes=rows)


@app.get("/programmes/new", response_class=HTMLResponse)
def programme_new(request: Request) -> HTMLResponse:
    return render(request, "programme_edit.html", programme=programmes.blank(), is_new=True, gaps=[])


@app.get("/programmes/{programme_id}", response_class=HTMLResponse)
def programme_edit(request: Request, programme_id: str) -> HTMLResponse:
    programme = programmes.load(programme_id)
    if programme is None:
        return problem_page(
            request, "No such programme", [f"'{programme_id}' was not found."], "/programmes"
        )
    return render(
        request,
        "programme_edit.html",
        programme=programme,
        is_new=False,
        gaps=programmes.gaps(programme_id),
    )


@app.post("/programmes/new")
async def programme_create(request: Request) -> Any:
    return await _programme_save(request, None)


@app.post("/programmes/{programme_id}")
async def programme_update(request: Request, programme_id: str) -> Any:
    return await _programme_save(request, programme_id)


async def _programme_save(request: Request, programme_id: str | None) -> Any:
    form = await request.form()
    before = programmes.load(programme_id) if programme_id else None
    try:
        parsed = programmes.parse(form, existing_id=programme_id)
        stored = programmes.save(parsed, before=before)
    except (ValidationError, db.DbError, db.NotAllowed) as error:
        problems = getattr(error, "problems", None) or [str(error)]
        return problem_page(
            request,
            "That programme was not saved",
            problems,
            f"/programmes/{programme_id}" if programme_id else "/programmes/new",
        )
    return RedirectResponse(f"/programmes/{stored['id']}?saved=1", status_code=303)


@app.post("/programmes/{programme_id}/active")
async def programme_active(request: Request, programme_id: str) -> Any:
    form = await request.form()
    try:
        programmes.set_active(programme_id, str(form.get("active", "")) == "1")
    except (db.DbError, db.NotAllowed) as error:
        return problem_page(
            request, "Could not change that", [str(error)], f"/programmes/{programme_id}"
        )
    return RedirectResponse("/programmes", status_code=303)


@app.get("/programmes/{programme_id}/days/{day_index}", response_class=HTMLResponse)
def programme_day(request: Request, programme_id: str, day_index: int) -> HTMLResponse:
    programme = programmes.load(programme_id)
    day = programmes.load_day(programme_id, day_index)
    if programme is None or day is None:
        return problem_page(
            request, "No such day", [f"Day {day_index} of '{programme_id}' was not found."],
            f"/programmes/{programme_id}",
        )
    return render(
        request,
        "programme_day.html",
        programme=programme,
        day=day,
        catalogue=programmes.all_exercises(),
    )


@app.post("/programmes/{programme_id}/days/{day_index}")
async def programme_day_save(request: Request, programme_id: str, day_index: int) -> Any:
    form = await request.form()
    day = programmes.load_day(programme_id, day_index)
    if day is None:
        return problem_page(
            request, "No such day", [f"Day {day_index} was not found."], f"/programmes/{programme_id}"
        )
    try:
        rows = programmes.parse_day_exercises(form, day)
        programmes.save_day_variant(day, str(form.get("variant")), rows)
    except (ValidationError, db.DbError, db.NotAllowed) as error:
        problems = getattr(error, "problems", None) or [str(error)]
        return problem_page(
            request,
            "That day was not saved",
            problems,
            f"/programmes/{programme_id}/days/{day_index}",
        )
    return RedirectResponse(
        f"/programmes/{programme_id}/days/{day_index}?saved=1", status_code=303
    )


# --- exercise catalogue ----------------------------------------------------


@app.get("/exercises", response_class=HTMLResponse)
def exercise_list(request: Request) -> HTMLResponse:
    return render(
        request,
        "exercises.html",
        exercises=programmes.all_exercises(),
        usage=programmes.exercise_usage(),
        editing=None,
    )


@app.get("/exercises/{exercise_id}", response_class=HTMLResponse)
def exercise_edit(request: Request, exercise_id: str) -> HTMLResponse:
    return render(
        request,
        "exercises.html",
        exercises=programmes.all_exercises(),
        usage=programmes.exercise_usage(),
        editing=db.select_one("exercises", id=f"eq.{exercise_id}"),
    )


@app.post("/exercises/save")
async def exercise_save(request: Request) -> Any:
    form = await request.form()
    existing_id = str(form.get("id", "")).strip() or None
    try:
        programmes.save_exercise(form, existing_id=existing_id)
    except (ValidationError, db.DbError, db.NotAllowed) as error:
        problems = getattr(error, "problems", None) or [str(error)]
        return problem_page(request, "That exercise was not saved", problems, "/exercises")
    return RedirectResponse("/exercises?saved=1", status_code=303)


# --- snapshot export -------------------------------------------------------


@app.post("/export/{domain}")
def export_domain(request: Request, domain: str) -> Any:
    try:
        path = export.export_recipes() if domain == "recipes" else export.export_programmes()
    except (db.DbError, db.NotAllowed) as error:
        return problem_page(request, "Export failed", [str(error)], "/")
    return RedirectResponse(f"/?exported={path.name}", status_code=303)
