"""The WSGI application gunicorn serves (`backoffice` command)."""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backoffice.settings")

from django.conf import settings
from django.core.wsgi import get_wsgi_application

from telemetry import configure_logging

application = get_wsgi_application()
configure_logging("payments-api", settings.LOG_LEVEL)
