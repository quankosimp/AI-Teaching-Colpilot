#!/bin/sh
set -e

# ==============================================================================
# Teaching Copilot — Container Entrypoint
# Safe migrations and optional demo fixtures seeding on startup
# ==============================================================================

echo "==> Teaching Copilot API container initializing..."

# Ensure node_modules/.bin is in PATH
export PATH="/app/node_modules/.bin:$PATH"

# Auto-migration on container startup (safe: migrate deploy only applies pending, never resets/drops)
if [ "${AUTO_MIGRATE:-true}" = "true" ]; then
  echo "==> Ensuring database connection and applying pending Prisma migrations..."
  RETRIES=30
  until /app/node_modules/.bin/prisma migrate deploy > /dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
    echo "    Waiting for PostgreSQL ($RETRIES retries remaining)..."
    RETRIES=$((RETRIES - 1))
    sleep 1
  done

  if [ $RETRIES -eq 0 ]; then
    echo "==> ERROR: Database connection failed or migration error occurred."
    /app/node_modules/.bin/prisma migrate deploy
    exit 1
  fi
  echo "==> Database migrations applied successfully."
fi

# Auto-seeding for local demo fixtures (allowed ONLY in local_mock or test)
if [ "${AUTO_SEED:-false}" = "true" ]; then
  if [ "$APP_MODE" != "local_mock" ] && [ "$APP_MODE" != "test" ]; then
    echo "==> ERROR: AUTO_SEED is forbidden when APP_MODE is '${APP_MODE:-production}'. Seeding is strictly local_mock/test only."
    exit 1
  fi

  echo "==> Running local demo fixtures seed (server/seed.ts)..."
  RETRIES=10
  SEED_OUTPUT=""
  until SEED_OUTPUT=$(/app/node_modules/.bin/tsx server/seed.ts 2>&1) || [ $RETRIES -eq 0 ]; do
    echo "    Waiting for services to be ready for seeding ($RETRIES retries remaining)..."
    RETRIES=$((RETRIES - 1))
    sleep 1
  done

  if [ $RETRIES -eq 0 ]; then
    echo "==> FATAL ERROR: Requested demo seeding failed. Terminal output:"
    echo "$SEED_OUTPUT" | sed 's/password=[^ &]*/password=[REDACTED]/gI'
    echo "==> Exiting container to prevent running broken demo fixtures."
    exit 1
  fi
  echo "==> Local demo fixtures and bucket initialized successfully."
fi

echo "==> Executing application process: $@"
exec "$@"
