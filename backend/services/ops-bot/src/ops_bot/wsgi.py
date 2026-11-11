"""The WSGI application gunicorn serves (`ops-bot serve`)."""

from ops_bot.web import create_app

app = create_app()
