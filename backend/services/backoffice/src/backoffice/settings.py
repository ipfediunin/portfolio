"""Django settings, from the environment (`BACKOFFICE_*`, see backend/.env.example).

Nothing unsafe has a default: without `BACKOFFICE_SECRET_KEY` Django refuses anything that signs
(sessions, CSRF), and the other values fall back to local development only.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

BASE_DIR = Path(__file__).resolve().parent


def _env(name: str, default: str = "") -> str:
    return os.environ.get(f"BACKOFFICE_{name}", default)


def _list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in _env(name, default).split(",") if item.strip()]


def _database(url: str) -> dict[str, object]:
    """`postgresql://user:password@host:port/name` → Django's DATABASES entry. The service owns the
    `backoffice` schema of the shared database (the Orders API owns `orders`)."""
    parts = urlsplit(url)
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": parts.path.lstrip("/"),
        "USER": unquote(parts.username or ""),
        "PASSWORD": unquote(parts.password or ""),
        "HOST": parts.hostname or "",
        "PORT": str(parts.port or 5432),
        "OPTIONS": {"options": "-c search_path=backoffice"},
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
    }


# Empty means unusable: Django raises as soon as something needs to sign.
SECRET_KEY = _env("SECRET_KEY")
DEBUG = _env("DEBUG") == "1"
ALLOWED_HOSTS = _list("ALLOWED_HOSTS", "localhost,127.0.0.1,payments")
# The admin is served on 127.0.0.1 only; these origins may post its forms.
CSRF_TRUSTED_ORIGINS = _list("CSRF_TRUSTED_ORIGINS", "http://127.0.0.1:8001,http://localhost:8001")
# Website origins that may send webhooks from the browser (the playground plays the provider).
CORS_ORIGINS = _list("CORS_ORIGINS", "http://localhost:3000")

DATABASES = {"default": _database(_env("DATABASE_URL", "postgresql://runtime@localhost/runtime"))}
REDIS_URL = _env("REDIS_URL", "redis://localhost:6379/0")
PROVIDER_URL = _env("PROVIDER_URL", "http://localhost:8100")
# The Orders API calls /internal/ with this token; nothing else may.
INTERNAL_TOKEN = _env("INTERNAL_TOKEN")
# Tests talk to the provider in-process (an httpx transport); None means real HTTP.
PROVIDER_TRANSPORT: object | None = None
PROVIDER_TIMEOUT_SECONDS = float(_env("PROVIDER_TIMEOUT_SECONDS", "2"))
TRACE_TTL_SECONDS = int(_env("TRACE_TTL_SECONDS", "300"))
# Payments and webhook events of a sandbox live as long as the sandbox.
SANDBOX_TTL_SECONDS = int(_env("SANDBOX_TTL_SECONDS", "1800"))
WEBHOOKS_PER_MINUTE = int(_env("WEBHOOKS_PER_MINUTE", "30"))

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "backoffice.payments",
]

MIDDLEWARE = [
    "backoffice.middleware.CorsMiddleware",
    "backoffice.middleware.TraceMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "backoffice.urls"
WSGI_APPLICATION = "backoffice.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# The admin's session: a signed cookie id, the data in PostgreSQL; never sent over plain HTTP in
# production, never readable by scripts.
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG and _env("INSECURE_COOKIES") != "1"
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
X_FRAME_OPTIONS = "DENY"

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
# The admin's CSS and JS are served from the installed packages: no collectstatic step and nothing
# written to the (read-only) container filesystem.
WHITENOISE_USE_FINDERS = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Logging is configured by telemetry (JSON lines), not by Django.
LOGGING_CONFIG = None
LOG_LEVEL = _env("LOG_LEVEL", "INFO")
