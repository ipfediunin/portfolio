"""Who is calling, without knowing who they are.

A client is identified by its sandbox token (stored only as a SHA-256 hash) or, without a token,
by a keyed hash of its IP address whose key changes every day. Neither can be traced back to a
person, and none of it outlives the sandbox or the rate-limit window.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime

from starlette.requests import Request

from contracts import client_key, token_hash

_TOKEN = re.compile(r"^[A-Za-z0-9_-]{43}$")
TOKEN_BYTES = 32  # token_urlsafe(32) → 43 characters


def new_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def bearer_token(request: Request) -> str | None:
    """The token from `Authorization: Bearer …` if it has the shape of a sandbox token."""
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    value = value.strip()
    if scheme.lower() != "bearer" or not _TOKEN.match(value):
        return None
    return value


def ip_hash(ip: str, secret: bytes, now: datetime | None = None) -> str:
    """HMAC of the IP with a key derived for the current UTC day: stable within a day only."""
    day = (now or datetime.now(UTC)).strftime("%Y-%m-%d")
    daily_key = hmac.new(secret, day.encode("ascii"), hashlib.sha256).digest()
    return hmac.new(daily_key, ip.encode("utf-8"), hashlib.sha256).hexdigest()[:32]


@dataclass(frozen=True)
class Client:
    """`key` names the client in Redis and PostgreSQL; `token_hash` is set when a token was sent."""

    key: str
    ip_key: str
    token_hash: str | None


def identify(request: Request, ip_secret: bytes) -> Client:
    ip = request.client.host if request.client else "unknown"
    hashed_ip = ip_hash(ip, ip_secret)
    token = bearer_token(request)
    if token is None:
        return Client(key=f"ip:{hashed_ip}", ip_key=hashed_ip, token_hash=None)
    hashed_token = token_hash(token)
    return Client(key=client_key(hashed_token), ip_key=hashed_ip, token_hash=hashed_token)
