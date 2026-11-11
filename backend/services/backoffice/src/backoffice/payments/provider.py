"""Client of the payment provider (the local stub in compose)."""

from __future__ import annotations

import httpx
from pydantic import BaseModel, ValidationError

from telemetry import span


class ProviderUnavailable(Exception):  # noqa: N818 — reads as the condition the caller handles
    """No usable answer in time: a timeout, a refused connection or a server error."""


class _PaymentMethods(BaseModel):
    payment_methods: list[str]


class ProviderClient:
    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def payment_methods(self, *, provider_down: bool) -> list[str]:
        """`provider_down` passes the demo's fault injection on to the stub."""
        headers = {"X-Fault-Provider-Down": "true"} if provider_down else {}
        with span("external", "GET /v1/payment-methods") as call:
            try:
                response = self._http.get("/v1/payment-methods", headers=headers)
            except httpx.TimeoutException as error:
                call.attributes["error"] = "timeout"
                raise ProviderUnavailable("the provider did not answer in time") from error
            except httpx.TransportError as error:
                call.attributes["error"] = type(error).__name__
                raise ProviderUnavailable("the provider is not reachable") from error
            call.attributes["status"] = response.status_code
            if not response.is_success:
                raise ProviderUnavailable(f"the provider answered {response.status_code}")
            try:
                return _PaymentMethods.model_validate_json(response.content).payment_methods
            except ValidationError as error:
                raise ProviderUnavailable("the provider's answer has an unknown format") from error
