# One image recipe for every Python service of the workspace; compose chooses the service:
#   docker build --build-arg SERVICE=order-worker -t runtime-city/order-worker:local .
# Each service installs a command named after itself (orders-api, order-worker, provider-stub).
FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /bin/uv
ARG SERVICE
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /src

# Dependencies first (cached until the lockfile changes). uv reads every member's pyproject to
# understand the workspace; only the service and what it depends on are installed.
COPY pyproject.toml uv.lock ./
COPY libs/contracts/pyproject.toml libs/contracts/
COPY libs/telemetry/pyproject.toml libs/telemetry/
COPY libs/messaging/pyproject.toml libs/messaging/
COPY services/orders-api/pyproject.toml services/orders-api/
COPY services/order-worker/pyproject.toml services/order-worker/
COPY services/provider-stub/pyproject.toml services/provider-stub/
COPY services/realtime-hub/pyproject.toml services/realtime-hub/
COPY services/backoffice/pyproject.toml services/backoffice/
COPY services/ops-bot/pyproject.toml services/ops-bot/
RUN test -n "$SERVICE" || (echo "Pass --build-arg SERVICE=<service>" && exit 1)
# uv's download cache lives in a BuildKit cache mount shared by every service's build: a changed
# lockfile re-installs from the cache instead of downloading every wheel again. (Not part of the
# image: with UV_LINK_MODE=copy the environment holds copies, not links into the cache.)
# sharing=locked: compose builds the services in parallel; one build at a time uses the cache, the
# others wait for it instead of timing out on uv's own cache lock during a slow download.
RUN --mount=type=cache,id=uv-cache,target=/root/.cache/uv,sharing=locked \
    uv sync --frozen --no-dev --no-install-workspace --package "$SERVICE"

COPY libs libs
COPY services/${SERVICE} services/${SERVICE}
RUN --mount=type=cache,id=uv-cache,target=/root/.cache/uv,sharing=locked \
    uv sync --frozen --no-dev --no-editable --package "$SERVICE"

FROM python:3.12-slim
ARG SERVICE
RUN useradd --system --uid 10001 --no-create-home app
COPY --from=build /app/.venv /app/.venv
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    SERVICE=${SERVICE}
USER app
# `exec` keeps the service as PID 1's child-free replacement, so it receives SIGTERM directly.
CMD ["/bin/sh", "-c", "exec \"$SERVICE\""]
