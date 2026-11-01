# Teaching Copilot — Local Docker Packaging & Deployment Runbook

This directory contains the container packaging, gateway configuration, and deployment manifests for **Teaching Copilot**.

---

## 1. Local Architecture Overview

```
                      Browser (Host Machine)
                                │
               HTTP Requests    │ http://127.0.0.1:4170
               Direct Uploads   │ http://127.0.0.1:59002
                                ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ Docker Network: internal_net (Project: teaching-copilot-local)│
 │                                                              │
 │   ┌────────────────────────────────────────────────────┐     │
 │   │ Caddy Gateway (teaching-copilot-gateway)           │     │
 │   │ • Listens on 127.0.0.1:4170                        │     │
 │   │ • Serves built React SPA (/srv static assets)      │     │
 │   │ • Proxies /api/*, /health/*, /socket.io/* to API   │     │
 │   └─────────────────────────┬──────────────────────────┘     │
 │                             │ internal :3100                 │
 │                             ▼                                │
 │   ┌────────────────────────────────────────────────────┐     │
 │   │ API Container (teaching-copilot-api)               │     │
 │   │ • Node 22 (Debian Bookworm OpenSSL 3.0.x engine)   │     │
 │   │ • Safe auto-migrations (prisma migrate deploy)     │     │
 │   │ • Auto-seed (teachers, students, private bucket)   │     │
 │   └─────────────┬──────────────────────────┬───────────┘     │
 │                 │                          │                 │
 │                 ▼                          ▼                 │
 │   ┌──────────────────────────┐ ┌───────────────────────────┐ │
 │   │ PostgreSQL 15            │ │ MinIO S3 Storage          │ │
 │   │ • Internal: postgres:5432│ │ • Internal: minio:9000    │ │
 │   │ • Host: 127.0.0.1:55433  │ │ • Host: 127.0.0.1:59002   │ │
 │   │ • Volume: pg_data        │ │ • Host Console: 59003     │ │
 │   │                          │ │ • Volume: minio_data      │ │
 │   └──────────────────────────┘ └─────────────┬─────────────┘ │
 │                                              │               │
 │                                ┌─────────────┴─────────────┐ │
 │                                │ minio-init (One-Shot Job) │ │
 │                                │ • Creates private bucket  │ │
 │                                │ • Configures S3 CORS rule │ │
 │                                └───────────────────────────┘ │
 └──────────────────────────────────────────────────────────────┘
```

### Port Isolation Summary

| Service | Internal Port | Host Published Port | Purpose / Collision Protection |
|---|---|---|---|
| Caddy Gateway | `4170` | `127.0.0.1:4170` | Primary local HTTP web and API origin |
| API Backend | `3100` | *None (Internal only)* | Protected behind Caddy gateway |
| PostgreSQL 15 | `5432` | `127.0.0.1:55433` | Isolated from dev (`55432`) and qatth (`5433`) |
| MinIO S3 API | `9000` | `127.0.0.1:59002` | Isolated from dev (`59000`) and qatth (`9000`) |
| MinIO Console | `9001` | `127.0.0.1:59003` | Isolated from qatth (`9001`) |

*All published host ports strictly bind to `127.0.0.1` — no wildcard `0.0.0.0` ports are opened on the host.*

---

## 2. Quickstart Runbook

### Start Stack
```bash
# Build and start all services in detached mode
docker compose -f compose.docker.yml --env-file deploy/local.env.example up -d --build

# Check status of containers
docker compose -f compose.docker.yml ps
```

### Run Migrations (Manual)
The API container automatically runs `prisma migrate deploy` on startup. If you ever need to run migrations manually:
```bash
docker compose -f compose.docker.yml exec api pnpm exec prisma migrate deploy
```

### Seed Local Demo Fixtures (Manual)
The API container automatically runs `pnpm run seed:local` on startup if `AUTO_SEED=true`. To re-run safely:
```bash
docker compose -f compose.docker.yml exec api pnpm run seed:local
```

### Check Logs
```bash
# View all logs
docker compose -f compose.docker.yml logs -f

# View API logs only
docker compose -f compose.docker.yml logs -f api

# View Gateway logs only
docker compose -f compose.docker.yml logs -f gateway
```

### Run Docker Doctor Diagnostic
```bash
node scripts/docker-doctor.mjs
```

### Stop Stack
```bash
# Stop containers without losing database or MinIO data
docker compose -f compose.docker.yml down

# Stop containers AND remove volumes (clean slate)
docker compose -f compose.docker.yml down -v
```

---

## 3. Public HTTPS & External Provider Blockers Note (EXT-01 .. EXT-04)

> [!IMPORTANT]
> **Clear Public HTTPS Blocked Status**
> 
> The local Docker setup runs strictly over HTTP on `http://127.0.0.1:4170` in `APP_MODE=local_mock`.
> Full public deployment and real provider verification are currently **BLOCKED** by the absence of external prerequisites:
> 
> | Dependency | Status | Required For |
> |---|---|---|
> | **EXT-01: Google OAuth Credentials** | Missing | Real Google OAuth login on public domain |
> | **EXT-02: Zoom Video SDK Credentials** | Missing | Real video/audio media sessions on public devices |
> | **EXT-03: Gemini API Key & Model** | Missing | Real AI-assisted claim suggestions and observation analysis |
> | **EXT-04: VPS Target & Public Domain DNS** | Missing | Public Let's Encrypt automated TLS certificates |

Local mock mode does not pretend that external providers are operational; health check `/api/v1/health` accurately reports unconfigured providers as `not_configured` / `probe: not_run` with overall status `degraded`.

---

## 4. Production Deployment Guidelines (Future Real Credentials)

When a domain name and server are provisioned:

1. **Domain & DNS**: Point your domain `A` and `AAAA` records to your server's public IP.
2. **Caddyfile**: Copy `deploy/caddy/Caddyfile.production.example` to `deploy/caddy/Caddyfile`, replacing `{$DOMAIN}` with your verified domain.
3. **Environment**:
   - Set `APP_MODE=production` and `NODE_ENV=production`.
   - Set `APP_ORIGIN=https://<your-domain>`.
   - Set `JWT_SECRET` to a cryptographically strong 64-character secret.
   - Configure real provider keys:
     - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
     - `ZOOM_SDK_KEY`, `ZOOM_SDK_SECRET`
     - `ENABLE_AI=true`, `GEMINI_API_KEY`, `GEMINI_MODEL`
   - Configure S3 with TLS (`MINIO_USE_SSL=true`).
4. **Ports**: Open host ports `80` and `443` for Caddy automatic TLS negotiation.
5. **Do NOT** commit production `.env` files or certificates to Git.

---

## 5. Primary Product Writer Coordination Points & Hooks (Resolved)

The required runtime coordination points have been integrated from Primary Product hook `e1c1c9d`:

1. **`BIND_HOST` inside container**:
   - `server/index.ts` now honors `process.env.BIND_HOST?.trim()`, binding `0.0.0.0` inside container so Caddy Gateway can proxy requests to `api:3100`.
2. **MinIO Public Signer Split**:
   - `server/routes/materials.ts` splits internal `client` (targeting internal `minio:9000`) and `publicClient` (targeting `MINIO_PUBLIC_ENDPOINT:MINIO_PUBLIC_PORT` e.g. `127.0.0.1:59002` with `MINIO_REGION=us-east-1`).
   - Browser direct PUT uploads and read URLs now resolve to the browser-accessible host port (`59002`).
3. **Explicit Local CORS & Private Bucket**:
   - MinIO CORS is strictly locked to local origins (`http://127.0.0.1:4170,http://localhost:4170`) without wildcards.
   - Bucket access policy is explicitly set to private (`mc anonymous set none`).
4. **Automated Seeding Safety Guard**:
   - `deploy/entrypoint.sh` strictly forbids `AUTO_SEED` in `production`/`staging` and fails with non-zero exit code if local seeding encounters errors.

## Local recovery checkpoint — 2026-11-01

The integrated local runtime is source `af70f23`. AI is explicitly enabled in
`deploy/local.env.example` for the local fake adapter; the UI labels its results.
Without Gemini credentials no real model is called. Production/staging reject
mock fallback. `MEDIA_PROVIDER` may select `zoom`; missing Zoom credentials return
an unavailable response. Native Zoom Toolkit controls still need credentialed,
real-device validation.

Before this upgrade, the supervisor saved a private database dump under
`verification/backups/g34-preupgrade/database.dump` and restored it into the new
`copilot_g34_restore_probe_20261101` database without overwriting the demo.
Restore succeeded; the probe contained 2 teachers,54 sessions and31 materials.
These files are ignored by Git; do not publish database dumps or storage objects.

Reproducible database backup (run from this directory's parent):

```bash
mkdir -p verification/backups
chmod 700 verification/backups
docker exec teaching-copilot-postgres pg_dump -U copilot -d copilot --format=custom > verification/backups/database.dump
chmod 600 verification/backups/database.dump
```

Restore into a **new dedicated database**, then inspect it before any cutover:

```bash
docker exec teaching-copilot-postgres createdb -U copilot copilot_restore_probe_NEW
docker exec -i teaching-copilot-postgres pg_restore -U copilot -d copilot_restore_probe_NEW --no-owner --exit-on-error < verification/backups/database.dump
```

Rollback image tags `teaching-copilot-local-api:rollback-55c05e1` and
`teaching-copilot-local-gateway:rollback-55c05e1` were rebuilt from immutable
source55c05e1 and inspected. The older running container's image metadata could
not be exported, so it was not treated as a valid image backup. A rollback would
use explicit Compose image overrides and `--no-build`; additive schema changes
should be evaluated against the selected old application before cutover.
The supervisor did **not** perform a live application rollback or restore object
storage. The database exercise is only one part of G5 recovery acceptance;
consistent database-plus-object-storage recovery, full rollback rehearsal and
final provider/NFR evidence remain open.
