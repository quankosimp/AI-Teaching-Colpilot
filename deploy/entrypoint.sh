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

# Auto-seeding for local demo fixtures (safe: upsert-based seed)
if [ "${AUTO_SEED:-false}" = "true" ]; then
  echo "==> Running local demo fixtures seed..."
  RETRIES=20
  until /app/node_modules/.bin/tsx server/seed.ts > /dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
    echo "    Waiting for MinIO and DB to be ready for seeding ($RETRIES retries remaining)..."
    RETRIES=$((RETRIES - 1))
    sleep 2
  done

  if [ $RETRIES -eq 0 ]; then
    echo "==> WARNING: Seeding timed out. You can run './node_modules/.bin/tsx server/seed.ts' manually."
  else
    echo "==> Local demo fixtures and bucket initialized."
  fi
fi

echo "==> Executing application process: $@"
exec "$@"
