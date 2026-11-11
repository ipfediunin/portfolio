"""Body validation as a traced step.

FastAPI validates declared bodies before the handler runs, where it cannot be timed. Here the raw
body is validated explicitly inside a span, and failures are raised as FastAPI's own
`RequestValidationError`, so the 422 response has exactly FastAPI's format."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError
from starlette.requests import Request

from telemetry import span

MAX_BODY_BYTES = 4096


async def validated_body[Model: BaseModel](
    request: Request,
    model: type[Model],
    rules: Callable[[Model], list[dict[str, Any]]] | None = None,
) -> Model:
    """`rules` adds checks the model cannot make alone (a body field against the path); it
    returns error items in FastAPI's format, `loc` starting with "body"."""
    raw = await request.body()
    async with span("validate", f"{model.__name__}.model_validate_json") as check:
        if len(raw) > MAX_BODY_BYTES:
            check.ok = False
            raise RequestValidationError(
                [
                    {
                        "type": "too_long",
                        "loc": ("body",),
                        "msg": f"Body should be at most {MAX_BODY_BYTES} bytes",
                        "input": None,
                    }
                ]
            )
        try:
            value = model.model_validate_json(raw)
        except ValidationError as error:
            check.ok = False
            check.attributes["errors"] = error.error_count()
            raise RequestValidationError(_as_body_errors(error)) from None
        broken = rules(value) if rules else []
        if broken:
            check.ok = False
            check.attributes["errors"] = len(broken)
            raise RequestValidationError(broken)
        return value


def _as_body_errors(error: ValidationError) -> list[dict[str, Any]]:
    """Pydantic errors with `body` in front of the location, as FastAPI reports them."""
    return [
        {**item, "loc": ("body", *item["loc"])}
        for item in error.errors(include_url=False, include_context=True)
    ]
