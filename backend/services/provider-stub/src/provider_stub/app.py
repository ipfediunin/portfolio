"""The payment provider stand-in: charges with idempotency keys, failures on request."""

from __future__ import annotations

import asyncio
import secrets
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Annotated, Any, Literal

from fastapi import FastAPI, Header, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field

IDEMPOTENCY_KEY = r"^[A-Za-z0-9_-]{8,64}$"
# An injected outage: the provider holds the connection this long instead of answering.
HANG_SECONDS = 5.0


class PaymentMethods(BaseModel):
    payment_methods: list[str]


class ChargeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount_cents: int = Field(ge=1, le=100_000_000)
    currency: Literal["EUR", "USD", "RUB"]
    # The merchant's reference (an order id); opaque to the provider.
    reference: str = Field(min_length=1, max_length=40)


class Charge(BaseModel):
    id: str
    status: Literal["succeeded"]
    amount_cents: int
    currency: str
    reference: str


@dataclass
class _KeyState:
    request: ChargeIn
    created: float = field(default_factory=time.monotonic)
    calls: int = 0
    charge: Charge | None = None


class IdempotencyStore:
    """What the provider remembers per idempotency key: bounded in size and in time."""

    def __init__(self, capacity: int = 10_000, ttl_seconds: float = 3600.0) -> None:
        self._capacity = capacity
        self._ttl = ttl_seconds
        self._states: OrderedDict[str, _KeyState] = OrderedDict()

    def state(self, key: str, request: ChargeIn) -> _KeyState:
        self._forget_expired()
        current = self._states.get(key)
        if current is None:
            # Full: the oldest key makes room (insertion order is age order).
            while len(self._states) >= self._capacity:
                self._states.popitem(last=False)
            current = _KeyState(request=request)
            self._states[key] = current
        return current

    def _forget_expired(self) -> None:
        now = time.monotonic()
        while self._states:
            oldest = next(iter(self._states.values()))
            if now - oldest.created < self._ttl:
                break
            self._states.popitem(last=False)


def create_app(store: IdempotencyStore | None = None) -> FastAPI:
    keys = store or IdempotencyStore()
    app = FastAPI(
        title="Payment provider (stub)",
        summary="Local stand-in for an external payment API: idempotency keys, fault injection.",
        redoc_url=None,
    )

    @app.post(
        "/v1/charges",
        status_code=status.HTTP_201_CREATED,
        responses={
            status.HTTP_200_OK: {"model": Charge, "description": "Replay of an earlier charge"},
            status.HTTP_409_CONFLICT: {"description": "Idempotency key reused with another body"},
            status.HTTP_503_SERVICE_UNAVAILABLE: {"description": "Injected outage"},
        },
    )
    async def create_charge(
        body: ChargeIn,
        response: Response,
        idempotency_key: Annotated[str, Header(alias="Idempotency-Key", pattern=IDEMPOTENCY_KEY)],
        fail_attempts: Annotated[int, Header(alias="X-Fault-Fail-Attempts", ge=0, le=5)] = 0,
    ) -> Charge:
        # No awaits below: on one event loop the read-modify-write of a key cannot interleave.
        state = keys.state(idempotency_key, body)
        if state.request != body:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Idempotency-Key was already used with another request"
            )
        if state.charge is not None:
            response.status_code = status.HTTP_200_OK
            response.headers["Idempotent-Replayed"] = "true"
            return state.charge
        state.calls += 1
        if state.calls <= fail_attempts:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                f"Provider unavailable (injected failure {state.calls} of {fail_attempts})",
                headers={"Retry-After": "1"},
            )
        state.charge = Charge(
            id=f"ch_{secrets.token_hex(8)}",
            status="succeeded",
            amount_cents=body.amount_cents,
            currency=body.currency,
            reference=body.reference,
        )
        return state.charge

    @app.get("/v1/payment-methods")
    async def payment_methods(
        provider_down: Annotated[bool, Header(alias="X-Fault-Provider-Down")] = False,
    ) -> PaymentMethods:
        """The methods a checkout may offer. With `X-Fault-Provider-Down: true` the provider stops
        answering: the reply comes only after `HANG_SECONDS`, long after any caller's timeout."""
        if provider_down:
            await asyncio.sleep(HANG_SECONDS)
        return PaymentMethods(payment_methods=["card", "sbp"])

    @app.get("/healthz")
    async def liveness() -> dict[str, Any]:
        return {"status": "ok"}

    return app
