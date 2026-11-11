"""`orders-api-migrate` command: applies the Alembic migrations of the service's own schema.

Configuration is built in code (no alembic.ini): the migrations ship inside the package and the
database URL comes from the same settings the service uses."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from orders_api.settings import get_settings
from telemetry import configure_logging

MIGRATIONS = Path(__file__).parent / "migrations"


def alembic_config(database_url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS))
    # ConfigParser treats "%" as interpolation; a password may contain it.
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


def run() -> None:
    settings = get_settings()
    configure_logging("orders-api-migrate", settings.log_level)
    command.upgrade(alembic_config(str(settings.database_url)), "head")
