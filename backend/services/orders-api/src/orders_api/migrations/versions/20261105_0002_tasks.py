"""Background tasks, and a few months of shared demo orders for the reports.

`tasks` records every job the API queues: reports and payments. The order worker finishes them
(`succeeded` / `failed`); `rejected` means the broker refused the job (backpressure). Like sandbox
orders, tasks belong to a client key and expire with the sandbox.

The demo orders (ids 36 to 41, before the shared order 42) give the monthly report something to
count. They are shared like order 42: no owner, no expiry.

Revision ID: 20261105_0002
Revises: 20261105_0001
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "20261105_0002"
down_revision: str | None = "20261105_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "orders"

# id, product id, quantity, delivery, total in cents, created at (UTC)
DEMO_ORDERS = [
    (36, 7, 1, "standard", 8900, "2026-09-14 10:24:00+00"),
    (37, 3, 2, "standard", 7800, "2026-09-28 16:05:00+00"),
    (38, 5, 1, "express", 5900, "2026-10-03 09:12:00+00"),
    (39, 11, 1, "standard", 32900, "2026-10-11 13:47:00+00"),
    (40, 7, 2, "express", 17800, "2026-10-19 18:30:00+00"),
    (41, 9, 1, "standard", 12990, "2026-10-27 08:55:00+00"),
]


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False),
        # Client key (a hash) of whoever queued the task.
        sa.Column("owner_key", sa.String(40), nullable=False),
        sa.Column(
            "order_id",
            sa.BigInteger,
            sa.ForeignKey(f"{SCHEMA}.orders.id", ondelete="CASCADE"),
            nullable=True,
        ),
        # What the job was asked to do (kept for inspecting and replaying failed jobs).
        sa.Column("params", JSONB, nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("attempts", sa.SmallInteger, nullable=False, server_default="0"),
        sa.Column("result", JSONB, nullable=True),
        sa.Column("error", sa.String(200), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('report', 'charge')", name="task_kind"),
        sa.CheckConstraint(
            "status IN ('queued', 'succeeded', 'failed', 'rejected')", name="task_status"
        ),
        sa.CheckConstraint("(kind = 'charge') = (order_id IS NOT NULL)", name="charge_has_order"),
        schema=SCHEMA,
    )
    op.create_index("tasks_owner_key", "tasks", ["owner_key"], schema=SCHEMA)
    op.create_index("tasks_expires_at", "tasks", ["expires_at"], schema=SCHEMA)

    for order_id, product_id, quantity, delivery, total, created_at in DEMO_ORDERS:
        op.execute(
            sa.text(
                f"""
                INSERT INTO {SCHEMA}.orders
                    (id, product_id, quantity, delivery, status, total_cents, currency, created_at)
                OVERRIDING SYSTEM VALUE
                VALUES (:id, :product_id, :quantity, :delivery, 'paid', :total, 'EUR',
                        CAST(:created_at AS timestamptz))
                """
            ).bindparams(
                id=order_id,
                product_id=product_id,
                quantity=quantity,
                delivery=delivery,
                total=total,
                created_at=created_at,
            )
        )


def downgrade() -> None:
    op.drop_table("tasks", schema=SCHEMA)
    ids = ", ".join(str(order[0]) for order in DEMO_ORDERS)
    op.execute(f"DELETE FROM {SCHEMA}.orders WHERE id IN ({ids})")
