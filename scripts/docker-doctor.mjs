#!/usr/bin/env node

/**
 * ==============================================================================
 * Teaching Copilot — Docker Doctor Diagnostic Tool
 * Validates local Docker configuration, port isolation, security rules,
 * container health, and reports blocked integration points accurately.
 * ==============================================================================
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import http from 'node:http';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(title, status, detail = '') {
  const badge =
    status === 'PASS'
      ? `${COLORS.green}[PASS]${COLORS.reset}`
      : status === 'BLOCKED'
      ? `${COLORS.yellow}[BLOCKED]${COLORS.reset}`
      : status === 'WARN'
      ? `${COLORS.yellow}[WARN]${COLORS.reset}`
      : `${COLORS.red}[FAIL]${COLORS.reset}`;
  console.log(`${badge} ${COLORS.bold}${title}${COLORS.reset}${detail ? ` - ${detail}` : ''}`);
}

async function probeHttp(url, options = {}) {
  return new Promise((resolve) => {
    const req = http.request(url, { timeout: 3000, ...options }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', (err) => resolve({ error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'TIMEOUT' });
    });
    req.end();
  });
}

async function runDiagnostics() {
  console.log(`\n${COLORS.cyan}================================================================${COLORS.reset}`);
  console.log(`${COLORS.bold}Teaching Copilot — Docker Packaging & Health Diagnostic Doctor${COLORS.reset}`);
  console.log(`${COLORS.cyan}================================================================\n${COLORS.reset}`);

  let allChecksPassed = true;
  const blockedPoints = [];

  // 1. Check required packaging files
  const requiredFiles = [
    'Dockerfile',
    '.dockerignore',
    'compose.docker.yml',
    'deploy/local.env.example',
    'deploy/caddy/Caddyfile',
    'deploy/caddy/Caddyfile.production.example',
    'deploy/entrypoint.sh',
    'deploy/scripts/init-minio.sh',
    'deploy/README.md',
  ];

  let missingFiles = 0;
  for (const f of requiredFiles) {
    if (!existsSync(f)) {
      log(`Required file '${f}'`, 'FAIL', 'File missing');
      missingFiles++;
      allChecksPassed = false;
    }
  }
  if (missingFiles === 0) {
    log('Packaging files verification', 'PASS', `All ${requiredFiles.length} files exist`);
  }

  // 2. Validate .dockerignore contents
  if (existsSync('.dockerignore')) {
    const dockerignore = readFileSync('.dockerignore', 'utf8');
    const mustIgnore = ['.git', '.env', 'node_modules', 'dist', 'dist-server', 'coverage', '*.docx'];
    const missingIgnore = mustIgnore.filter((pattern) => !dockerignore.includes(pattern));
    if (missingIgnore.length === 0) {
      log('.dockerignore security patterns', 'PASS', 'Git, secrets, node_modules, build & docs excluded');
    } else {
      log('.dockerignore security patterns', 'WARN', `Missing patterns: ${missingIgnore.join(', ')}`);
    }
  }

  // 3. Validate compose.docker.yml rules (host 127.0.0.1 binding only, no 0.0.0.0)
  if (existsSync('compose.docker.yml')) {
    const composeContent = readFileSync('compose.docker.yml', 'utf8');
    const hasWildcardPort = /ports:\s*\n\s*-\s*["']?0\.0\.0\.0/m.test(composeContent);
    const usesLocalhostOnly = !hasWildcardPort && composeContent.includes('127.0.0.1:');

    if (usesLocalhostOnly) {
      log('Host port exposure check', 'PASS', 'Strict 127.0.0.1 loopback binding; no host 0.0.0.0');
    } else {
      log('Host port exposure check', 'FAIL', 'Found 0.0.0.0 wildcard binding in compose.docker.yml');
      allChecksPassed = false;
    }

    // Check project isolation
    if (composeContent.includes('name: teaching-copilot-local')) {
      log('Project name isolation', 'PASS', "Configured as 'teaching-copilot-local'");
    } else {
      log('Project name isolation', 'WARN', "Missing explicit project name 'teaching-copilot-local'");
    }

    // Check named volumes isolation
    if (composeContent.includes('teaching-copilot-local-pg-data')) {
      log('Persistent volumes isolation', 'PASS', 'Named volumes isolated from dev and other projects');
    } else {
      log('Persistent volumes isolation', 'WARN', 'Verify named volume names');
    }
  }

  // 4. Check Docker daemon availability
  let dockerAlive = false;
  try {
    execSync('docker info > /dev/null 2>&1');
    dockerAlive = true;
    log('Docker daemon status', 'PASS', 'Docker engine is running and accessible');
  } catch {
    log('Docker daemon status', 'FAIL', 'Docker daemon is not reachable');
    allChecksPassed = false;
  }

  // 5. Check container states if running
  if (dockerAlive) {
    try {
      const psOutput = execSync(
        'docker ps --filter "name=teaching-copilot-" --format "{{.Names}}\t{{.Status}}\t{{.Ports}}"',
        { encoding: 'utf8' }
      ).trim();

      if (!psOutput) {
        log('Container running status', 'WARN', 'Stack not started yet. Run: docker compose -f compose.docker.yml up -d');
      } else {
        log('Container running status', 'PASS', 'Containers found:');
        for (const line of psOutput.split('\n')) {
          console.log(`    • ${line}`);
        }
      }
    } catch (e) {
      log('Container status check', 'WARN', e.message);
    }
  }

  // 6. Network connectivity & probe checks
  console.log(`\n${COLORS.cyan}--- Connectivity & Integration Probes ---${COLORS.reset}`);

  // Gateway check (port 4170)
  const gatewayProbe = await probeHttp('http://127.0.0.1:4170/');
  if (gatewayProbe.status === 200) {
    log('Gateway frontend SPA delivery', 'PASS', 'HTTP 200 OK from http://127.0.0.1:4170/');
  } else if (gatewayProbe.error) {
    log('Gateway frontend SPA delivery', 'WARN', `Not reachable on 127.0.0.1:4170 (${gatewayProbe.error})`);
  } else {
    log('Gateway frontend SPA delivery', 'WARN', `Unexpected status HTTP ${gatewayProbe.status}`);
  }

  // Gateway to API proxy check (port 4170 -> /health/live)
  const apiLiveProbe = await probeHttp('http://127.0.0.1:4170/health/live');
  if (apiLiveProbe.status === 200) {
    log('Gateway reverse-proxy to API /health/live', 'PASS', 'HTTP 200 OK');
  } else if (apiLiveProbe.status === 502) {
    log(
      'Gateway reverse-proxy to API /health/live',
      'BLOCKED',
      'HTTP 502 Bad Gateway (API inside container binds 127.0.0.1 only; BIND_HOST=0.0.0.0 required)'
    );
    blockedPoints.push({
      item: 'BIND_HOST support in server/index.ts',
      reason:
        'Express binds to 127.0.0.1 when APP_MODE=local_mock. Caddy gateway container cannot reach api:3100 until Primary Product enables BIND_HOST=0.0.0.0 inside container.',
    });

    // Verify API internal liveness inside container via docker exec
    try {
      const internalHealth = execSync(
        'docker compose -f compose.docker.yml exec -T api curl -s http://127.0.0.1:3100/api/v1/health',
        { encoding: 'utf8' }
      );
      const parsed = JSON.parse(internalHealth);
      log(
        'Internal API container health (127.0.0.1:3100)',
        'PASS',
        `DB: ${parsed.dependencies?.database}, Storage: ${parsed.dependencies?.storage}, Overall: ${parsed.status}`
      );
    } catch (e) {
      log('Internal API container health (127.0.0.1:3100)', 'WARN', 'Could not probe internal API health: ' + e.message);
    }
  } else {
    log('Gateway reverse-proxy to API /health/live', 'WARN', apiLiveProbe.error || `HTTP ${apiLiveProbe.status}`);
  }

  // API health dependency check (/api/v1/health)
  const apiHealthProbe = await probeHttp('http://127.0.0.1:4170/api/v1/health');
  if (apiHealthProbe.status === 200 || apiHealthProbe.status === 503) {
    try {
      const data = JSON.parse(apiHealthProbe.body);
      const dbStatus = data.dependencies?.database;
      const storageStatus = data.dependencies?.storage;
      log('API dependency: PostgreSQL', dbStatus === 'ready' ? 'PASS' : 'WARN', `Status: ${dbStatus}`);
      log('API dependency: MinIO storage', storageStatus === 'ready' ? 'PASS' : 'WARN', `Status: ${storageStatus}`);
    } catch {
      log('API health response parsing', 'WARN', 'Could not parse health JSON');
    }
  }

  // MinIO Public Signer check
  blockedPoints.push({
    item: 'MinIO Public Signer split in server/routes/materials.ts',
    reason:
      'Browser runs on host and cannot reach internal Docker host minio:9000 for presigned PUT. Primary Product must split internal client (minio:9000) from public signer (127.0.0.1:59002).',
  });

  // 7. Summary
  console.log(`\n${COLORS.cyan}================================================================${COLORS.reset}`);
  console.log(`${COLORS.bold}Diagnostic Summary & Primary Product Coordination Blockers:${COLORS.reset}`);
  console.log(`${COLORS.cyan}================================================================${COLORS.reset}`);

  if (blockedPoints.length > 0) {
    console.log(`\n${COLORS.yellow}${COLORS.bold}Pending Primary Product Integration Requests (Honest Status: BLOCKED):${COLORS.reset}`);
    for (const b of blockedPoints) {
      console.log(`  [!] ${COLORS.bold}${b.item}${COLORS.reset}`);
      console.log(`      ${b.reason}`);
    }
  }

  console.log('');
  return allChecksPassed;
}

runDiagnostics().catch((err) => {
  console.error('Fatal doctor error:', err);
  process.exit(1);
});
