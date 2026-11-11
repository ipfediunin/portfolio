# The website (Next.js) in production: the traced standalone server, no dev dependencies at runtime.
# Built by backend/compose.prod.yaml (service "site"), which passes:
# - the public settings as build args: NEXT_PUBLIC_* values are inlined into the bundle at build
#   time, so changing one means rebuilding the image;
# - the contact form's bot token as a build secret: the contact page is static and renders the form
#   only when the bot is configured at build time. A build secret stays out of the image layers
#   and history; at runtime the server action reads the token from the environment.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_BUILD_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SITE_INDEXABLE
ARG NEXT_PUBLIC_LIVE_API_URL
ARG NEXT_PUBLIC_OWNER_NAME
ARG NEXT_PUBLIC_OWNER_AGE
ARG NEXT_PUBLIC_OWNER_PHOTO
ARG NEXT_PUBLIC_CONTACT_EMAIL
ARG NEXT_PUBLIC_GITHUB_URL
ARG NEXT_PUBLIC_LINKEDIN_URL
ARG NEXT_PUBLIC_TELEGRAM_URL
ARG NEXT_PUBLIC_SCHEDULING_URL
ARG NEXT_PUBLIC_RESUME_URL
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN
ARG NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL
ARG TELEGRAM_CHAT_ID
RUN test -n "$NEXT_PUBLIC_SITE_URL" || (echo "Pass --build-arg NEXT_PUBLIC_SITE_URL=https://<domain>" && exit 1)
# Without the secret the file is absent and the token stays empty: the site is built without the form.
RUN --mount=type=secret,id=contact_telegram_bot_token \
    TELEGRAM_BOT_TOKEN="$(cat /run/secrets/contact_telegram_bot_token 2>/dev/null || true)" \
    npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# The code stays owned by root (read-only for the app); only Next's cache (optimized images,
# revalidated pages) is writable, and compose mounts a volume there.
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
EXPOSE 3000
CMD ["node", "server.js"]
