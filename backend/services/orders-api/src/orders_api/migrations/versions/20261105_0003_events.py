"""Events: the transactional outbox and what the consumer groups of orders.events keep.

- `outbox` — an event is inserted in the same transaction as the change it describes; the relay
  publishes unpublished rows to Kafka and marks them. No event without its data, no data without
  its event.
- `processed_events` — (group, event id) of every event a consumer group has handled: a repeated
  delivery finds its row and changes nothing.
- `reservations` — the inventory group's stock reservations, one per order.
- `daily_sales` — the analytics group's counters per day and product (aggregates, no owner).

Revision ID: 20261105_0003
Revises: 20261105_0002
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "20261105_0003"
down_revision: str | None = "20261105_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "orders"


def upgrade() -> None:
    op.create_table(
        "outbox",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("topic", sa.String(64), nullable=False),
        # The Kafka message key (the order id): one order's events stay in one partition.
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )
    # The relay reads only what is still unpublished.
    op.create_index(
        "outbox_unpublished",
        "outbox",
        ["id"],
        schema=SCHEMA,
        postgresql_where=sa.text("published_at IS NULL"),
    )

    op.create_table(
        "processed_events",
        sa.Column("consumer_group", sa.String(32), primary_key=True),
        sa.Column("event_id", sa.Uuid, primary_key=True),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        schema=SCHEMA,
    )
    op.create_index("processed_events_at", "processed_events", ["processed_at"], schema=SCHEMA)

    op.create_table(
        "reservations",
        sa.Column(
            "order_id",
            sa.BigInteger,
            sa.ForeignKey(f"{SCHEMA}.orders.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("product_id", sa.String(32), nullable=False),
        sa.Column("quantity", sa.SmallInteger, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "daily_sales",
        sa.Column("day", sa.Date, primary_key=True),
        sa.Column("product_id", sa.String(32), primary_key=True),
        sa.Column("orders", sa.Integer, nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("revenue_cents", sa.BigInteger, nullable=False),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("daily_sales", schema=SCHEMA)
    op.drop_table("reservations", schema=SCHEMA)
    op.drop_table("processed_events", schema=SCHEMA)
    op.drop_table("outbox", schema=SCHEMA)
