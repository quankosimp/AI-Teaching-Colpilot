# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Base image with Node 22 (Bookworm Debian matching OpenSSL 3.0.x)
# ==============================================================================
FROM node:22-bookworm-slim AS base

ENV NODE_ENV=development \
    PNPM_HOME="/root/.local/share/pnpm" \
    PATH="/root/.local/share/pnpm:$PATH"

WORKDIR /app

# Install Debian OpenSSL 3.0.x (matching Prisma engine), CA certificates and curl for healthchecks
RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends openssl ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# Pinned pnpm 11.25.0 via Corepack
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# ==============================================================================
# Stage 2: Dependencies installation and Prisma Client generation
# ==============================================================================
FROM base AS deps

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY prisma ./prisma

# Strict frozen install
RUN pnpm install --frozen-lockfile

# Generate Prisma client for Debian OpenSSL 3.0.x
RUN pnpm exec prisma generate

# ==============================================================================
# Stage 3: Builder stage for Vite frontend and TypeScript server
# ==============================================================================
FROM deps AS builder

WORKDIR /app

COPY . .

# Build Vite frontend (/app/dist) and TypeScript server (/app/dist-server)
RUN pnpm run build
RUN pnpm run build:server

# ==============================================================================
# Stage 4: API backend runtime container
# ==============================================================================
FROM base AS api

WORKDIR /app

ENV PATH="/app/node_modules/.bin:$PATH" \
    PORT=3100 \
    APP_MODE=local_mock \
    NODE_ENV=development

# Copy runtime node_modules, generated Prisma client, built server and sources
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/server ./server
COPY --from=builder /app/contracts ./contracts

# Copy container entrypoint script
COPY deploy/entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3100

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist-server/server/index.js"]

# ==============================================================================
# Stage 5: Caddy Gateway static server & reverse proxy
# ==============================================================================
FROM caddy:2-alpine AS gateway

# Copy built SPA static assets from builder stage
COPY --from=builder /app/dist /srv

# Copy Caddy gateway configuration
COPY deploy/caddy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 4170

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
