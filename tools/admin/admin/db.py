"""PostgREST client, with the table allowlist enforced on every single call.

Supabase's REST API is the same interface the app uses, so there is no second
description of the schema to keep in step. The trade is that there are no
transactions across tables — see `replace_children`, which is the one place
that matters, and the read-back in `save_and_verify`.
"""

from __future__ import annotations

from typing import Any

import httpx

from .config import ALLOWLIST, config


class NotAllowed(RuntimeError):
    """A table outside the allowlist, or a write while read-only."""


class DbError(RuntimeError):
    """PostgREST said no. Carries the readable part of its response."""


def _check(table: str, write: bool) -> None:
    if table not in ALLOWLIST:
        raise NotAllowed(
            f"Table '{table}' is not in the admin allowlist. "
            f"Allowed: {', '.join(sorted(ALLOWLIST))}."
        )
    if write and config.readonly:
        raise NotAllowed("ADMIN_READONLY is set — every write path is disabled.")


def _headers(prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": config.service_key,
        "Authorization": f"Bearer {config.service_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _raise_for(response: httpx.Response) -> None:
    if response.status_code < 400:
        return
    try:
        body = response.json()
        detail = body.get("message") or body.get("hint") or str(body)
        if body.get("details"):
            detail = f"{detail} — {body['details']}"
    except Exception:  # noqa: BLE001
        detail = response.text[:500]
    raise DbError(f"{response.status_code}: {detail}")


def _client() -> httpx.Client:
    return httpx.Client(base_url=f"{config.supabase_url}/rest/v1", timeout=30.0)


def select(
    table: str,
    *,
    columns: str = "*",
    order: str | None = None,
    limit: int | None = None,
    **filters: str,
) -> list[dict[str, Any]]:
    """Read rows. Filters are PostgREST operators, e.g. `id="eq.oats"`."""
    _check(table, write=False)
    params: dict[str, Any] = {"select": columns, **filters}
    if order:
        params["order"] = order
    if limit:
        params["limit"] = limit
    with _client() as client:
        response = client.get(f"/{table}", params=params, headers=_headers())
    _raise_for(response)
    return response.json()


def select_one(table: str, **filters: str) -> dict[str, Any] | None:
    rows = select(table, limit=1, **filters)
    return rows[0] if rows else None


def count(table: str, **filters: str) -> int:
    _check(table, write=False)
    with _client() as client:
        response = client.get(
            f"/{table}",
            params={"select": "*", **filters},
            headers={**_headers("count=exact"), "Range-Unit": "items", "Range": "0-0"},
        )
    _raise_for(response)
    content_range = response.headers.get("content-range", "*/0")
    return int(content_range.rsplit("/", 1)[-1] or 0)


def insert(table: str, rows: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
    _check(table, write=True)
    if not rows:
        return []
    with _client() as client:
        response = client.post(
            f"/{table}", json=rows, headers=_headers("return=representation")
        )
    _raise_for(response)
    return response.json()


def upsert(table: str, rows: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
    _check(table, write=True)
    if not rows:
        return []
    with _client() as client:
        response = client.post(
            f"/{table}",
            json=rows,
            headers=_headers("resolution=merge-duplicates,return=representation"),
        )
    _raise_for(response)
    return response.json()


def update(table: str, patch: dict[str, Any], **filters: str) -> list[dict[str, Any]]:
    _check(table, write=True)
    if not filters:
        raise NotAllowed("Refusing an unfiltered update — it would rewrite the whole table.")
    with _client() as client:
        response = client.patch(
            f"/{table}", params=filters, json=patch, headers=_headers("return=representation")
        )
    _raise_for(response)
    return response.json()


def delete(table: str, **filters: str) -> None:
    _check(table, write=True)
    if not filters:
        raise NotAllowed("Refusing an unfiltered delete — it would empty the table.")
    with _client() as client:
        response = client.delete(f"/{table}", params=filters, headers=_headers())
    _raise_for(response)


def replace_children(
    table: str, parent_column: str, parent_id: str, rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Delete a parent's child rows and write the new set.

    NOT atomic — PostgREST has no cross-table transaction. If the insert fails
    after the delete has landed, the parent is left with no children. That is
    visible rather than silent: the caller re-reads and shows what is stored,
    and re-saving fixes it. The atomic version of this is a Postgres function
    (`admin_upsert_recipe(jsonb)`); it is not built because it would mean a
    migration for a single-user desktop tool.
    """
    _check(table, write=True)
    delete(table, **{parent_column: f"eq.{parent_id}"})
    return insert(table, rows) if rows else []
