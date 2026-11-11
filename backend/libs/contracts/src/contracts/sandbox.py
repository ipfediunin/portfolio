"""The anonymous sandbox as every service sees it in Redis.

The Orders API creates sandboxes; the Payments API reads them to verify webhooks. A sandbox is
found by the SHA-256 of its token — the token itself is never stored.
"""

from __future__ import annotations

import hashlib
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


def sandbox_key(token_hash: str) -> str:
    return f"sandbox:{token_hash}"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def client_key(token_hash_: str) -> str:
    """The client key orders, tasks and payments of a sandbox are filed under."""
    return f"t:{token_hash_[:32]}"


def is_sandbox_owner(owner_key: str) -> bool:
    """Work without a sandbox is filed under a hashed IP (`ip:…`): nobody can listen for it."""
    return owner_key.startswith("t:")


class SandboxRecord(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    created_at: datetime
    # Signs the webhooks the page sends on behalf of the payment provider (HMAC-SHA256). The page
    # gets it with the token; like the token, it lives only as long as the sandbox.
    webhook_secret: str = Field(min_length=32, max_length=64)
