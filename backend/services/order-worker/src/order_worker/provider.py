"""Client of the payment provider. Every charge carries the task id as its idempotency key, so a
retried or redelivered job gets the original charge back instead of a second one."""

from __future__ import annotations

import httpx
from pydantic import BaseModel, ValidationError

from contracts import ChargeJob
from order_worker.failures import PermanentFailure, TransientFailure
from telemetry import span


class ProviderUnavailable(TransientFailure):
    pass


class ProviderRejected(PermanentFailure):
    pass


class _Charge(BaseModel):
    id: str
    status: str


class ProviderClient:
    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    async def charge(self, job: ChargeJob) -> str:
        """Charges the job's amount; returns the provider's charge id."""
        async with span("external", "POST /v1/charges") as call:
            try:
                response = await self._http.post(
                    "/v1/charges",
                    json={
                        "amount_cents": job.amount_cents,
                        "currency": job.currency,
                        "reference": str(job.order_id),
                    },
                    headers={
                        "Idempotency-Key": str(job.task_id),
                        "X-Fault-Fail-Attempts": str(job.fail_attempts),
                    },
                )
            except httpx.TimeoutException as error:
                call.attributes["error"] = "timeout"
                raise ProviderUnavailable("the provider did not answer in time") from error
            except httpx.TransportError as error:
                call.attributes["error"] = type(error).__name__
                raise ProviderUnavailable("the provider is not reachable") from error

            call.attributes["status"] = response.status_code
            if response.headers.get("idempotent-replayed") == "true":
                call.attributes["replayed"] = True
            if response.is_server_error or response.status_code == httpx.codes.TOO_MANY_REQUESTS:
                raise ProviderUnavailable(f"the provider answered {response.status_code}")
            if response.is_client_error:
                raise ProviderRejected(f"the provider refused the charge ({response.status_code})")
            try:
                charge = _Charge.model_validate_json(response.content)
            except ValidationError as error:
                raise ProviderRejected("the provider answered in an unexpected format") from error
        return charge.id
