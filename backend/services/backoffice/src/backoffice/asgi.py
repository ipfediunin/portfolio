"""The ASGI form of the application. Production runs WSGI under gunicorn; the integration tests
mount this one in-process behind the Orders API (httpx's ASGI transport)."""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backoffice.settings")

from django.core.asgi import get_asgi_application

application = get_asgi_application()
