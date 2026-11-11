"""Sandbox orders disappear when they expire, whether or not anyone deletes the sandbox."""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.ext.asyncio import create_async_engine

from orders_api.repository import Repository
from orders_api.settings import Settings

pytestmark = pytest.mark.integration


def test_expired_orders_are_deleted(
    api: TestClient, token: str, settings: Settings, sync_engine: Engine
) -> None:
    created = api.post(
        "/api/orders",
        json={"product_id": "hs-5", "quantity": 1, "delivery": "standard"},
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    with sync_engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE orders.orders SET expires_at = now() - interval '1 second' WHERE id = :id"
            ),
            {"id": created["id"]},
        )

    async def sweep() -> int:
        engine = create_async_engine(str(settings.database_url))
        try:
            return await Repository(engine).delete_expired()
        finally:
            await engine.dispose()

    assert asyncio.run(sweep()) == 1
    with sync_engine.connect() as connection:
        remaining = connection.execute(
            text("SELECT count(*) FROM orders.orders WHERE id IN (:id, 42)"),
            {"id": created["id"]},
        ).scalar_one()
    assert remaining == 1  # only the shared demo order is left
