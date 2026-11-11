"""Orders schema: a snapshot of the catalog, orders, and the shared demo data.

`product_snapshots` is the Orders API's own copy of the catalog. In a later stage the catalog's
owner (the Django back office) publishes changes and this table follows them; here it is seeded.
Order 42 is the shared demo order the playground reads; every other order belongs to a sandbox
(`owner_key`) and expires with it.

Revision ID: 20261105_0001
Revises:
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261105_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "orders"

PRODUCTS = [
    (7, "kb-7", "Mechanical keyboard", 8900),
    (3, "ms-3", "Wireless mouse", 3900),
    (5, "hs-5", "Studio headset", 5900),
    (9, "dk-9", "USB-C dock", 12990),
    (11, "mn-11", "27-inch monitor", 32900),
]


def upgrade() -> None:
    op.create_table(
        "product_snapshots",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=False),
        sa.Column("sku", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("price_cents", sa.Integer, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
        sa.CheckConstraint("price_cents > 0", name="price_positive"),
        schema=SCHEMA,
    )
    op.create_table(
        "orders",
        sa.Column("id", sa.BigInteger, sa.Identity(start=1001), primary_key=True),
        sa.Column(
            "product_id",
            sa.Integer,
            sa.ForeignKey(f"{SCHEMA}.product_snapshots.id"),
            nullable=False,
        ),
        sa.Column("quantity", sa.SmallInteger, nullable=False),
        sa.Column("delivery", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("total_cents", sa.Integer, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        # Sandbox client key (a hash), or NULL for the shared demo order.
        sa.Column("owner_key", sa.String(40), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("quantity BETWEEN 1 AND 10", name="quantity_range"),
        sa.CheckConstraint("delivery IN ('standard', 'express')", name="delivery_kind"),
        sa.CheckConstraint(
            "(owner_key IS NULL) = (expires_at IS NULL)", name="sandbox_orders_expire"
        ),
        schema=SCHEMA,
    )
    op.create_index("orders_owner_key", "orders", ["owner_key"], schema=SCHEMA)
    op.create_index("orders_expires_at", "orders", ["expires_at"], schema=SCHEMA)

    products = sa.table(
        "product_snapshots",
        sa.column("id", sa.Integer),
        sa.column("sku", sa.String),
        sa.column("name", sa.String),
        sa.column("price_cents", sa.Integer),
        schema=SCHEMA,
    )
    op.bulk_insert(
        products,
        [
            {"id": id_, "sku": sku, "name": name, "price_cents": price}
            for id_, sku, name, price in PRODUCTS
        ],
    )
    # The shared demo order: OVERRIDING SYSTEM VALUE keeps the identity sequence at 1001.
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.orders
            (id, product_id, quantity, delivery, status, total_cents, currency)
        OVERRIDING SYSTEM VALUE
        VALUES (42, 9, 1, 'express', 'paid', 12990, 'EUR')
        """
    )


def downgrade() -> None:
    op.drop_table("orders", schema=SCHEMA)
    op.drop_table("product_snapshots", schema=SCHEMA)
