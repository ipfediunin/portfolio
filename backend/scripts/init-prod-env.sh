#!/usr/bin/env sh
# Creates backend/.env for production from .env.production.example, with a fresh random value for
# every secret. Run once on the server, from anywhere:
#   sh backend/scripts/init-prod-env.sh
# Then add the Telegram bot token(s) to backend/.env (the public data is already in the template).
set -eu

cd "$(dirname "$0")/.."

if [ -e .env ]; then
  echo "backend/.env already exists: not overwriting it (secrets in use would change)." >&2
  exit 1
fi
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

# Hex: safe inside database URLs and accepted as Telegram's webhook secret (32+ characters).
secret() { openssl rand -hex 32; }

umask 077
sed \
  -e "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$(secret)/" \
  -e "s/^RABBITMQ_PASSWORD=$/RABBITMQ_PASSWORD=$(secret)/" \
  -e "s/^INTERNAL_TOKEN=$/INTERNAL_TOKEN=$(secret)/" \
  -e "s/^ORDERS_API_IP_HASH_SECRET=$/ORDERS_API_IP_HASH_SECRET=$(secret)/" \
  -e "s/^BACKOFFICE_SECRET_KEY=$/BACKOFFICE_SECRET_KEY=$(secret)/" \
  -e "s/^OPS_BOT_WEBHOOK_SECRET=$/OPS_BOT_WEBHOOK_SECRET=$(secret)/" \
  .env.production.example > .env

echo "Created backend/.env (readable only by you) with random secrets."
echo "Now add CONTACT_TELEGRAM_BOT_TOKEN (and, if wanted, OPS_BOT_TELEGRAM_TOKEN) to it."
