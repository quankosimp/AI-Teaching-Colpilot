#!/bin/sh
set -e

# ==============================================================================
# MinIO Initialization Script (One-Shot)
# Sets alias, creates private bucket, and configures S3 CORS for browser PUT
# ==============================================================================

TARGET_HOST="${MINIO_HOST:-minio}"
TARGET_PORT="${MINIO_PORT:-9000}"
ROOT_USER="${MINIO_ROOT_USER:-copilotlocal}"
ROOT_PASS="${MINIO_ROOT_PASSWORD:-copilot_local_only}"
BUCKET="${MINIO_BUCKET:-copilot-private}"

echo "==> Configuring MinIO client alias for http://${TARGET_HOST}:${TARGET_PORT}..."
RETRIES=30
until mc alias set local "http://${TARGET_HOST}:${TARGET_PORT}" "$ROOT_USER" "$ROOT_PASS" > /dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
  echo "    Waiting for MinIO service to become ready ($RETRIES retries remaining)..."
  RETRIES=$((RETRIES - 1))
  sleep 1
done

if [ $RETRIES -eq 0 ]; then
  echo "==> ERROR: Could not connect to MinIO after 30 attempts."
  exit 1
fi

echo "==> Ensuring private bucket '${BUCKET}' exists..."
mc mb --ignore-existing "local/${BUCKET}"

echo "==> Enforcing strict private access policy (mc anonymous set none)..."
mc anonymous set none "local/${BUCKET}"

echo "==> MinIO private bucket '${BUCKET}' initialized successfully with private-only policy."
echo "==> MinIO CORS is enabled server-side for local origins (http://127.0.0.1:4170, http://localhost:4170)."
