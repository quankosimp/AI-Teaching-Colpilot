#!/usr/bin/env node

/**
 * ==============================================================================
 * Teaching Copilot — Docker Packaging & Functional Health Diagnostic Doctor
 * ==============================================================================
 * Comprehensive assertions suite:
 * 1. Packaging files integrity and .dockerignore rules (preventing nested env leaks
 *    and excluding worktree .git files).
 * 2. Rendered Docker Compose JSON inspection (execFileSync, safe argv, --env-file passed):
 *    - All published ports across all services strictly bound to 127.0.0.1 (zero 0.0.0.0).
 *    - Isolated project name 'teaching-copilot-local'.
 *    - Isolated named volumes ('teaching-copilot-local-pg-data', 'teaching-copilot-local-minio-data').
 * 3. Container runtime states & health check statuses.
 * 4. Actual OPTIONS CORS probe:
 *    - Allowed origin (http://127.0.0.1:4170) returns exact origin header & method PUT.
 *    - Denied untrusted origin does NOT receive allow-origin or wildcard.
 * 5. Functional HTTP Assertions & Live Smoke Flow via Caddy Gateway (127.0.0.1:4170):
 *    - Static SPA HTML delivery (200 OK)
 *    - Gateway reverse-proxy to API /health/live (200 OK)
 *    - Detailed API health dependencies (/api/v1/health: DB & MinIO ready, degraded for local mock)
 *    - Teacher-A mock authentication (POST /api/v1/auth/mock)
 *    - Upload intent creation (POST /api/v1/materials/upload-intent)
 *    - Validation that presigned URL host is browser-accessible (127.0.0.1:59002), not internal minio
 *    - Browser direct S3 PUT upload of tiny valid PDF with Content-Length & CORS
 *    - Material finalization (POST /api/v1/materials) with Idempotency-Key
 *    - Teacher-A read ownership: GET /api/v1/materials verifies list inclusion
 *    - Teacher-A signed download: GET /api/v1/materials/:id/read-url (200 OK) -> fetch signed URL (200 OK)
 *      and assert byte-for-byte content matching!
 *    - Teacher-B cross-tenant denial:
 *      * Login as teacher-b
 *      * GET /api/v1/materials does NOT leak teacher-a's material
 *      * GET /api/v1/materials/:id/read-url as teacher-b is strictly rejected with HTTP 403 Forbidden!
 * 6. MinIO Private Bucket Security Probe on ACTUAL created file key:
 *    - Strips query from actual verified file URL and attempts anonymous GET
 *    - Asserts HTTP 403/401 (rejects 404), proving the existing file is strictly private!
 *
 * Exits with NON-ZERO code (1) if ANY required check or assertion fails.
 * ==============================================================================
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';

// CLI / Environment Configuration
const args = process.argv.slice(2);
function getArg(flag, envVar, fallback) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return process.env[envVar] || fallback;
}

const COMPOSE_FILE = getArg('--compose', 'COMPOSE_FILE', 'compose.docker.yml');
const GATEWAY_URL = getArg('--gateway-url', 'GATEWAY_URL', 'http://127.0.0.1:4170').replace(/\/+$/, '');
const MINIO_URL = getArg('--minio-url', 'MINIO_URL', 'http://127.0.0.1:59002').replace(/\/+$/, '');
const ENV_FILE = getArg('--env-file', 'ENV_FILE', 'deploy/local.env.example');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

let allChecksPassed = true;
const summaryIssues = [];

function logPass(title, detail = '') {
  console.log(`${COLORS.green}[PASS]${COLORS.reset} ${COLORS.bold}${title}${COLORS.reset}${detail ? ` - ${detail}` : ''}`);
}

function logFail(title, errorDetail = '') {
  allChecksPassed = false;
  summaryIssues.push({ title, status: 'FAIL', detail: errorDetail });
  console.log(`${COLORS.red}[FAIL]${COLORS.reset} ${COLORS.bold}${title}${COLORS.reset}${errorDetail ? ` - ${errorDetail}` : ''}`);
}

function logBlocked(title, blockedDetail = '') {
  allChecksPassed = false;
  summaryIssues.push({ title, status: 'BLOCKED', detail: blockedDetail });
  console.log(`${COLORS.yellow}[BLOCKED]${COLORS.reset} ${COLORS.bold}${title}${COLORS.reset}${blockedDetail ? ` - ${blockedDetail}` : ''}`);
}

function logInfo(title, detail = '') {
  console.log(`       ${COLORS.cyan}•${COLORS.reset} ${title}${detail ? `: ${detail}` : ''}`);
}

// HTTP request helper with Buffer support without logging secrets
function requestHttp(url, options = {}, bodyBuffer = null) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const headers = { ...(options.headers || {}) };
      if (bodyBuffer && !headers['Content-Length'] && !headers['content-length']) {
        headers['Content-Length'] = Buffer.byteLength(bodyBuffer);
      }
      const reqOptions = {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers,
        timeout: options.timeout || 5000,
      };

      const req = http.request(reqOptions, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const rawBuffer = Buffer.concat(chunks);
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: rawBuffer.toString('utf8'),
            buffer: rawBuffer,
          });
        });
      });

      req.on('error', (err) => resolve({ error: err.message, statusCode: 0, headers: {}, body: '', buffer: Buffer.alloc(0) }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ error: 'TIMEOUT', statusCode: 0, headers: {}, body: '', buffer: Buffer.alloc(0) });
      });

      if (bodyBuffer) {
        req.write(bodyBuffer);
      }
      req.end();
    } catch (err) {
      resolve({ error: err.message, statusCode: 0, headers: {}, body: '', buffer: Buffer.alloc(0) });
    }
  });
}

// Safe URL sanitizer (redacts sensitive query params like X-Amz-Signature, access tokens, etc.)
function sanitizeUrl(urlString) {
  try {
    const u = new URL(urlString);
    for (const key of Array.from(u.searchParams.keys())) {
      if (/signature|credential|token|secret|auth/i.test(key)) {
        u.searchParams.set(key, '[REDACTED]');
      }
    }
    return u.toString();
  } catch {
    return '[INVALID_URL]';
  }
}

async function main() {
  console.log(`\n${COLORS.cyan}================================================================${COLORS.reset}`);
  console.log(`${COLORS.bold}Teaching Copilot — Docker Doctor Diagnostic & Verification Suite${COLORS.reset}`);
  console.log(`Gateway Target : ${COLORS.bold}${GATEWAY_URL}${COLORS.reset}`);
  console.log(`MinIO Target   : ${COLORS.bold}${MINIO_URL}${COLORS.reset}`);
  console.log(`Compose File   : ${COLORS.bold}${COMPOSE_FILE}${COLORS.reset}`);
  console.log(`Env File       : ${COLORS.bold}${ENV_FILE}${COLORS.reset}`);
  console.log(`${COLORS.cyan}================================================================\n${COLORS.reset}`);

  // ---------------------------------------------------------------------------
  // 1. Packaging Files Verification
  // ---------------------------------------------------------------------------
  console.log(`${COLORS.bold}1. Packaging Files Integrity${COLORS.reset}`);
  const requiredFiles = [
    'Dockerfile',
    '.dockerignore',
    COMPOSE_FILE,
    ENV_FILE,
    'deploy/caddy/Caddyfile',
    'deploy/caddy/Caddyfile.production.example',
    'deploy/entrypoint.sh',
    'deploy/scripts/init-minio.sh',
    'deploy/README.md',
  ];

  let missingCount = 0;
  for (const f of requiredFiles) {
    if (existsSync(f)) {
      logInfo(f, 'present');
    } else {
      missingCount++;
      logFail(`File '${f}'`, 'Missing required packaging file');
    }
  }
  if (missingCount === 0) {
    logPass('All required packaging files exist');
  }

  // ---------------------------------------------------------------------------
  // 2. .dockerignore Security Inspection
  // ---------------------------------------------------------------------------
  console.log(`\n${COLORS.bold}2. Docker Build Context Security (.dockerignore)${COLORS.reset}`);
  if (existsSync('.dockerignore')) {
    const ign = readFileSync('.dockerignore', 'utf8');
    const requiredPatterns = ['node_modules', 'dist', 'dist-server', 'coverage', '*.docx'];
    const missingPatterns = requiredPatterns.filter((p) => !ign.includes(p));

    // Check worktree .git file exclusion (must match .git as a file)
    const hasWorktreeGitProtection = ign.split('\n').some((line) => line.trim() === '.git');

    // Check recursive nested env file protection
    const hasNestedEnvProtection =
      (ign.includes('**/.env') || ign.includes('**/*.env')) &&
      ign.includes('**/.env.*') &&
      ign.includes('**/*.env.*');

    if (missingPatterns.length === 0 && hasNestedEnvProtection && hasWorktreeGitProtection) {
      logPass(
        '.dockerignore patterns',
        'Worktree .git file, secrets, recursive nested envs, build artifacts and docs excluded'
      );
    } else {
      const issues = [];
      if (missingPatterns.length > 0) issues.push(`Missing patterns: ${missingPatterns.join(', ')}`);
      if (!hasNestedEnvProtection) issues.push('Lacks recursive nested env ignore (**/.env, **/*.env, **/*.env.*)');
      if (!hasWorktreeGitProtection) issues.push('Lacks exact worktree .git file rule (.git without trailing slash)');
      logFail('.dockerignore security rules', issues.join('; '));
    }
  } else {
    logFail('.dockerignore check', 'File .dockerignore is missing');
  }

  // ---------------------------------------------------------------------------
  // 3. Rendered Compose JSON Inspection (Safe execFileSync with argv)
  // ---------------------------------------------------------------------------
  console.log(`\n${COLORS.bold}3. Rendered Docker Compose JSON Inspection (Safe argv, --env-file)${COLORS.reset}`);
  let renderedCompose = null;
  const composeBaseArgs = ['compose', '-f', COMPOSE_FILE];
  if (ENV_FILE && existsSync(ENV_FILE)) {
    composeBaseArgs.push('--env-file', ENV_FILE);
  }

  try {
    const rawJson = execFileSync('docker', [...composeBaseArgs, 'config', '--format', 'json'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    renderedCompose = JSON.parse(rawJson);
    logPass('Rendered compose JSON parsed successfully via execFileSync');
  } catch (err) {
    logFail('Docker compose config rendering', err.message);
  }

  if (renderedCompose) {
    // Assert project name
    const projectName = renderedCompose.name;
    if (projectName === 'teaching-copilot-local') {
      logPass('Project name isolation', `Exact match: '${projectName}'`);
    } else {
      logFail('Project name isolation', `Expected 'teaching-copilot-local', got '${projectName}'`);
    }

    // Inspect ALL published ports across ALL services
    const services = renderedCompose.services || {};
    let portViolations = 0;
    let publishedPortCount = 0;

    for (const [sName, sDef] of Object.entries(services)) {
      if (Array.isArray(sDef.ports)) {
        for (const p of sDef.ports) {
          publishedPortCount++;
          const hostIp = p.host_ip;
          const pubPort = p.published;
          const targetPort = p.target;

          if (hostIp !== '127.0.0.1') {
            portViolations++;
            logFail(
              `Service '${sName}' port exposure`,
              `Bound to '${hostIp || '0.0.0.0'}:${pubPort}' -> target ${targetPort}. MUST bind strictly to 127.0.0.1`
            );
          } else {
            logInfo(`Service '${sName}'`, `127.0.0.1:${pubPort} -> ${targetPort} (safe loopback)`);
          }
        }
      }
    }

    if (publishedPortCount === 0) {
      logFail('Published ports check', 'No published ports found in compose configuration');
    } else if (portViolations === 0) {
      logPass(`All published ports (${publishedPortCount}) strictly bound to 127.0.0.1 (zero 0.0.0.0 exposure)`);
    }

    // Inspect persistent volumes isolation
    const volumes = renderedCompose.volumes || {};
    const pgVol = volumes.pg_data?.name;
    const minioVol = volumes.minio_data?.name;
    if (pgVol === 'teaching-copilot-local-pg-data' && minioVol === 'teaching-copilot-local-minio-data') {
      logPass('Persistent volumes naming isolation', `${pgVol}, ${minioVol}`);
    } else {
      logFail('Persistent volumes isolation', `Unexpected volume names: pg=${pgVol}, minio=${minioVol}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Running Containers State Verification
  // ---------------------------------------------------------------------------
  console.log(`\n${COLORS.bold}4. Running Container Instances${COLORS.reset}`);
  let runningContainers = [];
  try {
    const psRaw = execFileSync(
      'docker',
      [...composeBaseArgs, 'ps', '--format', '{{.Name}}|{{.Service}}|{{.Status}}|{{.Health}}'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (psRaw) {
      runningContainers = psRaw.split('\n').map((line) => {
        const [name, service, status, health] = line.split('|');
        return { name, service, status, health };
      });
    }
  } catch (err) {
    logFail('Docker ps execution', err.message);
  }

  if (runningContainers.length === 0) {
    logFail('Containers running status', `No containers active for compose '${COMPOSE_FILE}'. Start with: docker compose -f ${COMPOSE_FILE} up -d`);
    printSummaryAndExit();
    return;
  }

  for (const c of runningContainers) {
    const isUp = c.status?.toLowerCase().includes('up');
    const isHealthy = !c.health || c.health?.toLowerCase().includes('healthy');
    if (isUp && isHealthy) {
      logPass(`Container '${c.name}' (${c.service})`, `${c.status}${c.health ? ` [${c.health}]` : ''}`);
    } else {
      logFail(`Container '${c.name}' (${c.service})`, `Unhealthy state: ${c.status} [${c.health || 'no-health'}]`);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Actual OPTIONS CORS Verification
  // ---------------------------------------------------------------------------
  console.log(`\n${COLORS.bold}5. Actual MinIO OPTIONS CORS Policy Verification${COLORS.reset}`);
  // 5.1 Valid local origin preflight
  const corsAllowedRes = await requestHttp(`${MINIO_URL}/copilot-private/test-cors-probe`, {
    method: 'OPTIONS',
    headers: {
      Origin: GATEWAY_URL,
      'Access-Control-Request-Method': 'PUT',
    },
  });

  const allowOriginHeader = corsAllowedRes.headers['access-control-allow-origin'];
  const allowMethodsHeader = corsAllowedRes.headers['access-control-allow-methods'];

  if (
    (corsAllowedRes.statusCode === 200 || corsAllowedRes.statusCode === 204) &&
    allowOriginHeader === GATEWAY_URL &&
    allowMethodsHeader?.includes('PUT')
  ) {
    logPass(
      'Valid local origin CORS preflight',
      `HTTP ${corsAllowedRes.statusCode}, Access-Control-Allow-Origin: ${allowOriginHeader}, Methods: ${allowMethodsHeader}`
    );
  } else {
    logFail(
      'Valid local origin CORS preflight',
      `Expected HTTP 200/204 with exact origin ${GATEWAY_URL} and method PUT. Got: status=${corsAllowedRes.statusCode}, origin=${allowOriginHeader}, methods=${allowMethodsHeader}`
    );
  }

  // 5.2 Untrusted outside origin preflight
  const untrustedOrigin = 'https://untrusted-external-attacker.invalid';
  const corsDeniedRes = await requestHttp(`${MINIO_URL}/copilot-private/test-cors-probe`, {
    method: 'OPTIONS',
    headers: {
      Origin: untrustedOrigin,
      'Access-Control-Request-Method': 'PUT',
    },
  });

  const deniedOriginHeader = corsDeniedRes.headers['access-control-allow-origin'];
  if (!deniedOriginHeader || (deniedOriginHeader !== untrustedOrigin && deniedOriginHeader !== '*')) {
    logPass(
      'Untrusted outside origin CORS rejection',
      `Untrusted origin '${untrustedOrigin}' was NOT allowed (allow-origin header: ${deniedOriginHeader || 'none'})`
    );
  } else {
    logFail(
      'Untrusted outside origin CORS rejection',
      `SECURITY LEAK: Untrusted origin was allowed with header: '${deniedOriginHeader}'`
    );
  }

  // ---------------------------------------------------------------------------
  // 6. Functional HTTP Assertions & Live Smoke Flow via Gateway
  // ---------------------------------------------------------------------------
  console.log(`\n${COLORS.bold}6. Functional HTTP Assertions via Gateway (${GATEWAY_URL})${COLORS.reset}`);

  // 6.1 Static SPA Delivery
  const spaRes = await requestHttp(`${GATEWAY_URL}/`);
  if (spaRes.statusCode === 200 && spaRes.body.includes('<div id="root"></div>')) {
    logPass('Gateway Static SPA Delivery', `HTTP 200 OK, index.html served (${spaRes.body.length} bytes)`);
  } else {
    logFail('Gateway Static SPA Delivery', `Expected HTTP 200 with SPA HTML, got HTTP ${spaRes.statusCode} (${spaRes.error || 'bad content'})`);
  }

  // 6.2 Gateway to API Liveness Reverse-Proxy (/health/live)
  const liveRes = await requestHttp(`${GATEWAY_URL}/health/live`);
  if (liveRes.statusCode === 200) {
    try {
      const liveJson = JSON.parse(liveRes.body);
      if (liveJson.status === 'ok') {
        logPass('Gateway -> API /health/live proxy', 'HTTP 200 OK (status: ok)');
      } else {
        logFail('Gateway -> API /health/live proxy', `Expected status "ok", got: ${liveRes.body}`);
      }
    } catch {
      logFail('Gateway -> API /health/live proxy', 'Response JSON parse failed');
    }
  } else if (liveRes.statusCode === 502) {
    logBlocked(
      'Gateway -> API /health/live proxy',
      'HTTP 502 Bad Gateway (API inside container binds 127.0.0.1; BIND_HOST=0.0.0.0 required)'
    );
  } else {
    logFail('Gateway -> API /health/live proxy', `Expected HTTP 200, got HTTP ${liveRes.statusCode} (${liveRes.error || 'refused'})`);
  }

  // 6.3 Detailed Dependency Health (/api/v1/health)
  const healthRes = await requestHttp(`${GATEWAY_URL}/api/v1/health`);
  if (healthRes.statusCode === 200 || healthRes.statusCode === 503) {
    try {
      const hData = JSON.parse(healthRes.body);
      const dbReady = hData.dependencies?.database === 'ready';
      const storageReady = hData.dependencies?.storage === 'ready';
      const isDegraded = hData.status === 'degraded';

      if (dbReady && storageReady && isDegraded) {
        logPass(
          'API Dependency Health (/api/v1/health)',
          `PostgreSQL: ready, MinIO storage: ready, Mode status: degraded (valid unconfigured providers in local_mock)`
        );
      } else {
        logFail(
          'API Dependency Health (/api/v1/health)',
          `PostgreSQL: ${hData.dependencies?.database || 'unknown'}, MinIO: ${hData.dependencies?.storage || 'unknown'}, Status: ${hData.status}`
        );
      }
    } catch {
      logFail('API Dependency Health', 'Failed to parse health response JSON');
    }
  } else {
    logFail('API Dependency Health (/api/v1/health)', `HTTP ${healthRes.statusCode} (${healthRes.error || 'error'})`);
  }

  // ---------------------------------------------------------------------------
  // 7. Complete Teacher-A Flow: Auth -> Presign -> PUT -> Finalize -> Read URL -> Fetch
  // ---------------------------------------------------------------------------
  console.log(`\n${COLORS.bold}7. Teacher-A Flow: Auth -> Presign -> S3 PUT -> Finalize -> Read URL -> Content Match${COLORS.reset}`);

  // Step 7.1: Mock Teacher-A Login
  let teacherAToken = null;
  const authARes = await requestHttp(
    `${GATEWAY_URL}/api/v1/auth/mock`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: GATEWAY_URL,
      },
    },
    Buffer.from(JSON.stringify({ account: 'teacher-a' }))
  );

  if (authARes.statusCode === 200) {
    try {
      const aData = JSON.parse(authARes.body);
      if (typeof aData.accessToken === 'string' && aData.accessToken.length > 20) {
        teacherAToken = aData.accessToken;
        logPass('Mock Teacher Auth (teacher-a)', 'HTTP 200 OK, valid access token received (token value redacted)');
      } else {
        logFail('Mock Teacher Auth (teacher-a)', 'Response missing valid accessToken string');
      }
    } catch {
      logFail('Mock Teacher Auth (teacher-a)', 'Could not parse auth JSON response');
    }
  } else if (authARes.statusCode === 502) {
    logBlocked('Mock Teacher Auth (teacher-a)', 'HTTP 502 Bad Gateway - API proxy unreachable');
  } else {
    logFail('Mock Teacher Auth (teacher-a)', `Expected HTTP 200, got HTTP ${authARes.statusCode} (${authARes.body})`);
  }

  if (!teacherAToken) {
    logFail('Teacher-A flow', 'Cannot proceed without teacher-a auth token');
    printSummaryAndExit();
    return;
  }

  // Step 7.2: Create Upload Intent for a valid tiny PDF
  const testPdfContent = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const pdfSha256 = createHash('sha256').update(testPdfContent).digest('hex');
  const pdfSizeBytes = testPdfContent.length;

  let uploadId = null;
  let uploadUrl = null;

  const intentRes = await requestHttp(
    `${GATEWAY_URL}/api/v1/materials/upload-intent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherAToken}`,
        Origin: GATEWAY_URL,
      },
    },
    Buffer.from(
      JSON.stringify({
        fileName: 'smoke-test-doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfSizeBytes,
        sha256: pdfSha256,
      })
    )
  );

  if (intentRes.statusCode === 201) {
    try {
      const iData = JSON.parse(intentRes.body);
      uploadId = iData.uploadId;
      uploadUrl = iData.uploadUrl;
      if (uploadId && uploadUrl) {
        logPass('Upload Intent Creation', `HTTP 201 Created, uploadId: ${uploadId}`);
      } else {
        logFail('Upload Intent Creation', 'Response missing uploadId or uploadUrl');
      }
    } catch {
      logFail('Upload Intent Creation', 'Failed to parse upload intent JSON response');
    }
  } else {
    logFail('Upload Intent Creation', `Expected HTTP 201, got HTTP ${intentRes.statusCode} (${intentRes.body})`);
  }

  if (!uploadId || !uploadUrl) {
    logFail('Teacher-A flow', 'Cannot proceed without valid uploadId and uploadUrl');
    printSummaryAndExit();
    return;
  }

  // Step 7.3: Validate Browser Host in Presigned URL
  const parsedUploadUrl = new URL(uploadUrl);
  const uploadHostPort = `${parsedUploadUrl.hostname}:${parsedUploadUrl.port}`;
  const isInternalHost = parsedUploadUrl.hostname === 'minio';
  const isBrowserHost =
    parsedUploadUrl.hostname === '127.0.0.1' ||
    parsedUploadUrl.hostname === 'localhost';

  if (isInternalHost) {
    logBlocked(
      'Presigned URL Browser Host Accessibility',
      `URL targets internal container host '${uploadHostPort}'. Browser on host cannot resolve this.`
    );
    printSummaryAndExit();
    return;
  } else if (isBrowserHost) {
    logPass(
      'Presigned URL Browser Host Accessibility',
      `URL correctly targets host loopback: ${uploadHostPort} (${sanitizeUrl(uploadUrl)})`
    );
  } else {
    logFail('Presigned URL Browser Host Accessibility', `Unexpected host in presigned URL: ${uploadHostPort}`);
    printSummaryAndExit();
    return;
  }

  // Step 7.4: Direct HTTP PUT to MinIO with Browser CORS Check
  const putRes = await requestHttp(
    uploadUrl,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf',
        Origin: GATEWAY_URL,
      },
    },
    testPdfContent
  );

  if (putRes.statusCode === 200) {
    logPass('Direct Browser S3 PUT Upload', 'HTTP 200 OK, payload accepted by MinIO');
  } else {
    logFail('Direct Browser S3 PUT Upload', `Expected HTTP 200, got HTTP ${putRes.statusCode} (${putRes.error || putRes.body})`);
    printSummaryAndExit();
    return;
  }

  // Step 7.5: Finalize Material Creation
  let createdMaterialId = null;
  const finalizeRes = await requestHttp(
    `${GATEWAY_URL}/api/v1/materials`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherAToken}`,
        Origin: GATEWAY_URL,
        'Idempotency-Key': randomUUID(),
      },
    },
    Buffer.from(
      JSON.stringify({
        title: 'Docker Ops Smoke Material',
        subject: 'Toán học',
        grade: 'Lớp 10',
        topic: 'Đại số',
        level: 'CoBan',
        kind: 'PDF',
        description: 'Created by docker-doctor automated smoke verification',
        source: 'Giáo án tự soạn',
        uploadId,
      })
    )
  );

  if (finalizeRes.statusCode === 201) {
    try {
      const fData = JSON.parse(finalizeRes.body);
      createdMaterialId = fData.material?.id;
      if (createdMaterialId) {
        logPass('Material Finalization', `HTTP 201 Created, Material ID: ${createdMaterialId}`);
      } else {
        logFail('Material Finalization', 'Response missing material.id');
      }
    } catch {
      logFail('Material Finalization', 'Failed to parse finalize response JSON');
    }
  } else {
    logFail('Material Finalization', `Expected HTTP 201, got HTTP ${finalizeRes.statusCode} (${finalizeRes.body})`);
  }

  if (!createdMaterialId) {
    logFail('Teacher-A flow', 'Cannot proceed without createdMaterialId');
    printSummaryAndExit();
    return;
  }

  // Step 7.6: Teacher-A Read Ownership List Verification
  const listRes = await requestHttp(`${GATEWAY_URL}/api/v1/materials`, {
    headers: {
      Authorization: `Bearer ${teacherAToken}`,
    },
  });

  if (listRes.statusCode === 200) {
    try {
      const lData = JSON.parse(listRes.body);
      const found = (lData.materials || []).some((m) => m.id === createdMaterialId);
      if (found) {
        logPass('Teacher Material Ownership List', `HTTP 200 OK, created material ${createdMaterialId} present in teacher-a list`);
      } else {
        logFail('Teacher Material Ownership List', `Created material ${createdMaterialId} not found in teacher-a list`);
      }
    } catch {
      logFail('Teacher Material Ownership List', 'Could not parse material list JSON');
    }
  } else {
    logFail('Teacher Material Ownership List', `Expected HTTP 200, got HTTP ${listRes.statusCode}`);
  }

  // Step 7.7: Teacher-A Signed Download URL & Content Integrity Check
  let verifiedFileReadUrl = null;
  const readUrlRes = await requestHttp(`${GATEWAY_URL}/api/v1/materials/${createdMaterialId}/read-url`, {
    headers: {
      Authorization: `Bearer ${teacherAToken}`,
    },
  });

  if (readUrlRes.statusCode === 200) {
    try {
      const rData = JSON.parse(readUrlRes.body);
      verifiedFileReadUrl = rData.readUrl;
      if (verifiedFileReadUrl) {
        logPass(
          'Teacher-A /materials/:id/read-url',
          `HTTP 200 OK, signed readUrl received (${sanitizeUrl(verifiedFileReadUrl)})`
        );

        // Fetch actual file content from signed readUrl
        const downloadRes = await requestHttp(verifiedFileReadUrl);
        if (downloadRes.statusCode === 200) {
          const downloadedBytes = downloadRes.buffer;
          if (downloadedBytes.equals(testPdfContent)) {
            logPass(
              'Teacher-A S3 Download Byte Verification',
              `HTTP 200 OK, downloaded ${downloadedBytes.length} bytes matching uploaded test PDF exactly!`
            );
          } else {
            logFail(
              'Teacher-A S3 Download Byte Verification',
              `Downloaded byte mismatch: expected ${testPdfContent.length} bytes, got ${downloadedBytes.length}`
            );
          }
        } else {
          logFail(
            'Teacher-A S3 Download Byte Verification',
            `Expected HTTP 200 from signed readUrl, got HTTP ${downloadRes.statusCode} (${downloadRes.error || downloadRes.body})`
          );
        }
      } else {
        logFail('Teacher-A /materials/:id/read-url', 'Response missing readUrl property');
      }
    } catch {
      logFail('Teacher-A /materials/:id/read-url', 'Failed to parse read-url response JSON');
    }
  } else {
    logFail(
      'Teacher-A /materials/:id/read-url',
      `Expected HTTP 200, got HTTP ${readUrlRes.statusCode} (${readUrlRes.body})`
    );
  }

  // ---------------------------------------------------------------------------
  // 8. Cross-Owner Tenant Privacy Verification (Teacher-B)
  // ---------------------------------------------------------------------------
  console.log(`\n${COLORS.bold}8. Cross-Owner Tenant Privacy Verification (Teacher-B)${COLORS.reset}`);

  // Step 8.1: Teacher-B Login
  let teacherBToken = null;
  const authBRes = await requestHttp(
    `${GATEWAY_URL}/api/v1/auth/mock`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: GATEWAY_URL,
      },
    },
    Buffer.from(JSON.stringify({ account: 'teacher-b' }))
  );

  if (authBRes.statusCode === 200) {
    try {
      const bAuthData = JSON.parse(authBRes.body);
      teacherBToken = bAuthData.accessToken;
      if (teacherBToken) {
        logPass('Mock Teacher Auth (teacher-b)', 'HTTP 200 OK, valid access token received (token value redacted)');
      } else {
        logFail('Mock Teacher Auth (teacher-b)', 'Response missing accessToken');
      }
    } catch {
      logFail('Mock Teacher Auth (teacher-b)', 'Could not parse auth JSON response');
    }
  } else {
    logFail('Mock Teacher Auth (teacher-b)', `Expected HTTP 200, got HTTP ${authBRes.statusCode} (${authBRes.body})`);
  }

  if (!teacherBToken) {
    logFail('Cross-tenant verification', 'Cannot proceed without teacher-b auth token');
    printSummaryAndExit();
    return;
  }

  // Step 8.2: Teacher-B List Isolation
  const bListRes = await requestHttp(`${GATEWAY_URL}/api/v1/materials`, {
    headers: { Authorization: `Bearer ${teacherBToken}` },
  });

  if (bListRes.statusCode === 200) {
    try {
      const bData = JSON.parse(bListRes.body);
      const leaked = (bData.materials || []).some((m) => m.id === createdMaterialId);
      if (!leaked) {
        logPass(
          'Cross-Tenant Material List Privacy',
          `Teacher-B cannot see Teacher-A material ${createdMaterialId}`
        );
      } else {
        logFail(
          'Cross-Tenant Material List Privacy',
          `SECURITY VIOLATION: Teacher-A material ${createdMaterialId} leaked into Teacher-B list!`
        );
      }
    } catch {
      logFail('Cross-Tenant Material List Privacy', 'Could not parse Teacher-B material list JSON');
    }
  } else {
    logFail('Cross-Tenant Material List Privacy', `Expected HTTP 200, got HTTP ${bListRes.statusCode}`);
  }

  // Step 8.3: Teacher-B Denial on SAME /materials/:id/read-url (Must be 403 Forbidden)
  const bReadUrlRes = await requestHttp(`${GATEWAY_URL}/api/v1/materials/${createdMaterialId}/read-url`, {
    headers: { Authorization: `Bearer ${teacherBToken}` },
  });

  if (bReadUrlRes.statusCode === 403) {
    logPass(
      'Cross-Tenant /materials/:id/read-url Access Denial',
      `Teacher-B request strictly rejected with HTTP 403 Forbidden (PERMISSION_DENIED)`
    );
  } else {
    logFail(
      'Cross-Tenant /materials/:id/read-url Access Denial',
      `SECURITY VIOLATION: Expected HTTP 403 Forbidden, got HTTP ${bReadUrlRes.statusCode} (${bReadUrlRes.body})`
    );
  }

  // ---------------------------------------------------------------------------
  // 9. MinIO Private Bucket Security Probe on ACTUAL Created File Key
  // ---------------------------------------------------------------------------
  console.log(`\n${COLORS.bold}9. Direct MinIO Private Bucket Anonymous Access Rejection Probe${COLORS.reset}`);

  if (verifiedFileReadUrl) {
    // Strip query parameters to get the exact unauthenticated raw object URL
    const rawObjectUrl = new URL(verifiedFileReadUrl);
    rawObjectUrl.search = '';
    const unauthenticatedUrl = rawObjectUrl.toString();

    const anonProbe = await requestHttp(unauthenticatedUrl);
    if (anonProbe.statusCode === 403 || anonProbe.statusCode === 401) {
      logPass(
        'Actual Verified File Anonymous Access Rejection',
        `Direct unauthenticated S3 GET to verified file rejected with HTTP ${anonProbe.statusCode} (bucket is strictly private; 404 rejected)`
      );
    } else if (anonProbe.statusCode === 200) {
      logFail(
        'Actual Verified File Anonymous Access Rejection',
        `CRITICAL SECURITY LEAK: Anonymous GET to verified file succeeded with HTTP 200 OK! Bucket is public!`
      );
    } else {
      logFail(
        'Actual Verified File Anonymous Access Rejection',
        `Expected HTTP 403 or 401 on verified file key, got HTTP ${anonProbe.statusCode} (cannot accept 404 as proof of private bucket)`
      );
    }
  } else {
    logFail(
      'Actual Verified File Anonymous Access Rejection',
      'Cannot probe actual file because verifiedFileReadUrl was not obtained'
    );
  }

  // ---------------------------------------------------------------------------
  // 10. Summary & Nonzero Exit Code
  // ---------------------------------------------------------------------------
  printSummaryAndExit();
}

function printSummaryAndExit() {
  console.log(`\n${COLORS.cyan}================================================================${COLORS.reset}`);
  console.log(`${COLORS.bold}Doctor Diagnostic Summary:${COLORS.reset}`);
  console.log(`${COLORS.cyan}================================================================${COLORS.reset}`);

  if (allChecksPassed) {
    console.log(`\n${COLORS.green}${COLORS.bold}>>> ALL PACKAGING, SECURITY, HEALTH & FUNCTIONAL ASSERTIONS PASSED! <<<${COLORS.reset}`);
    console.log(`${COLORS.green}Exit Code: 0${COLORS.reset}\n`);
    process.exitCode = 0;
  } else {
    console.log(`\n${COLORS.red}${COLORS.bold}>>> DIAGNOSTIC ASSERTIONS FAILED OR BLOCKED: <<<${COLORS.reset}`);
    for (const issue of summaryIssues) {
      const badge =
        issue.status === 'BLOCKED'
          ? `${COLORS.yellow}[BLOCKED]${COLORS.reset}`
          : `${COLORS.red}[FAIL]${COLORS.reset}`;
      console.log(`  ${badge} ${COLORS.bold}${issue.title}${COLORS.reset}`);
      console.log(`         ${issue.detail}`);
    }
    console.log(`\n${COLORS.red}${COLORS.bold}Exiting with NON-ZERO code (1) as required.${COLORS.reset}\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nFatal unhandled doctor exception:', err);
  process.exit(1);
});
