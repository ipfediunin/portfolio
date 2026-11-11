"""Alembic environment for the `orders` schema (async engine, asyncpg)."""

from __future__ import annotations

import asyncio

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

SCHEMA = "orders"
config = context.config


def _run(connection: Connection) -> None:
    # The service owns one schema; the version table lives in it too.
    connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
    connection.commit()
    context.configure(connection=connection, target_metadata=None, version_table_schema=SCHEMA)
    with context.begin_transaction():
        context.run_migrations()


async def _run_async() -> None:
    engine = async_engine_from_config(
        config.get_section(config.config_ini_section) or {},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with engine.connect() as connection:
        await connection.run_sync(_run)
    await engine.dispose()


if context.is_offline_mode():
    raise RuntimeError("Offline (SQL script) migrations are not used for this service")
asyncio.run(_run_async())
