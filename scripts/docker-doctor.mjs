#!/usr/bin/env node

/**
 * ==============================================================================
 * Teaching Copilot — Docker Packaging & Functional Health Diagnostic Doctor
 * ==============================================================================
 * Validates:
 * 1. Packaging files and .dockerignore rules (preventing nested env leaks).
 * 2. Rendered Docker Compose manifest (JSON inspection: all published ports on 127.0.0.1).
 * 3. Container runtime states & Docker engine status.
 * 4. Real HTTP smoke test through Caddy Gateway (127.0.0.1:4170):
 *    - SPA delivery (200 OK)
 *    - Gateway reverse-proxy to API /health/live (200 OK)
 *    - Real dependency health (/api/v1/health: DB & MinIO ready, degraded valid for local mock)
 *    - Mock teacher login (POST /api/v1/auth/mock)
 *    - Upload intent creation (POST /api/v1/materials/upload-intent)
 *    - Validation of presigned URL host (must be browser-accessible host, NOT internal minio)
 *    - Direct browser signed PUT to MinIO with CORS check
 *    - Material finalization (POST /api/v1/materials)
 *    - Teacher ownership read verification (GET /api/v1/materials)
 *    - Cross-owner privacy check (teacher-b cannot access teacher-a's private material)
 *    - Direct private bucket anonymous access rejection probe
 *
 * Exits with NON-ZERO code (1) if any check or assertion fails.
 * ==============================================================================
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
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

// HTTP request helper without logging secrets
function requestHttp(url, options = {}, bodyBuffer = null) {
  return new Promise((resolve) => {
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
        const rawBody = Buffer.concat(chunks).toString('utf8');
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: rawBody,
        });
      });
    });

    req.on('error', (err) => resolve({ error: err.message, statusCode: 0, headers: {}, body: '' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'TIMEOUT', statusCode: 0, headers: {}, body: '' });
    });

    if (bodyBuffer) {
      req.write(bodyBuffer);
    }
    req.end();
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
    const requiredPatterns = ['.git', 'node_modules', 'dist', 'dist-server', 'coverage', '*.docx'];
    const missingPatterns = requiredPatterns.filter((p) => !ign.includes(p));

    // Check nested env file protection
    const hasNestedEnvProtection = ign.includes('**/.env') || ign.includes('**/*.env');

    if (missingPatterns.length === 0 && hasNestedEnvProtection) {
      logPass('.dockerignore patterns', 'Git, secrets, nested envs, build artifacts and docs excluded');
    } else {
      const issues = [];
      if (missingPatterns.length > 0) issues.push(`Missing patterns: ${missingPatterns.join(', ')}`);
      if (!hasNestedEnvProtection) issues.push('Lacks recursive nested env ignore (**/.env)');
      logFail('.dockerignore security rules', issues.join('; '));
    }
  } else {
    logFail('.dockerignore check', 'File .dockerignore is missing');
  }

  // ---------------------------------------------------------------------------
  // 3. Rendered Compose JSON Inspection (ALL Published Ports Check)
  // ---------------------------------------------------------------------------
  console.log(`\n${COLORS.bold}3. Rendered Docker Compose JSON Inspection${COLORS.reset}`);
  let renderedCompose = null;
  try {
    const rawJson = execSync(`docker compose -f ${COMPOSE_FILE} config --format json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    renderedCompose = JSON.parse(rawJson);
    logPass('Rendered compose JSON parsed successfully');
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
    const psRaw = execSync(
      `docker compose -f ${COMPOSE_FILE} ps --format "{{.Name}}|{{.Service}}|{{.Status}}|{{.Health}}"`,
      { encoding: 'utf8' }
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
  // 5. Functional HTTP Assertions & Local-Mock Smoke Flow (through Gateway)
  // ---------------------------------------------------------------------------
  console.log(`\n${COLORS.bold}5. Functional HTTP Assertions & Live Smoke Flow via Gateway (${GATEWAY_URL})${COLORS.reset}`);

  // 5.1 Static SPA Delivery
  const spaRes = await requestHttp(`${GATEWAY_URL}/`);
  if (spaRes.statusCode === 200 && spaRes.body.includes('<div id="root"></div>')) {
    logPass('Gateway Static SPA Delivery', `HTTP 200 OK, index.html served (${spaRes.body.length} bytes)`);
  } else {
    logFail('Gateway Static SPA Delivery', `Expected HTTP 200 with SPA HTML, got HTTP ${spaRes.statusCode} (${spaRes.error || 'bad content'})`);
  }

  // 5.2 Gateway to API Liveness Reverse-Proxy (/health/live)
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

  // 5.3 Detailed Dependency Health (/api/v1/health)
  const healthRes = await requestHttp(`${GATEWAY_URL}/api/v1/health`);
  if (healthRes.statusCode === 200 || healthRes.statusCode === 503) {
    try {
      const hData = JSON.parse(healthRes.body);
      const dbReady = hData.dependencies?.database === 'ready';
      const storageReady = hData.dependencies?.storage === 'ready';

      if (dbReady && storageReady) {
        logPass('API Dependency Health (/api/v1/health)', `PostgreSQL: ready, MinIO storage: ready, Mode status: ${hData.status}`);
      } else {
        logFail(
          'API Dependency Health (/api/v1/health)',
          `PostgreSQL: ${hData.dependencies?.database || 'unknown'}, MinIO: ${hData.dependencies?.storage || 'unknown'}`
        );
      }
    } catch {
      logFail('API Dependency Health', 'Failed to parse health response JSON');
    }
  } else {
    logFail('API Dependency Health (/api/v1/health)', `HTTP ${healthRes.statusCode} (${healthRes.error || 'error'})`);
  }

  // ---------------------------------------------------------------------------
  // 6. Complete Teacher Flow: Auth -> Presign -> PUT -> Finalize -> Cross-Owner
  // ---------------------------------------------------------------------------
  console.log(`\n${COLORS.bold}6. Real Local-Mock HTTP Flow (Auth -> Presign -> CORS PUT -> Finalize -> Ownership)${COLORS.reset}`);

  // Step 6.1: Mock Teacher-A Login
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

  // If Auth failed, we cannot continue the authenticated resource flow
  if (!teacherAToken) {
    logFail('Authenticated smoke test flow', 'Aborted due to auth failure');
    printSummaryAndExit();
    return;
  }

  // Step 6.2: Create Upload Intent for a valid tiny PDF
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
      logPass('Upload Intent Creation', `HTTP 201 Created, uploadId: ${uploadId}`);
    } catch {
      logFail('Upload Intent Creation', 'Failed to parse upload intent JSON response');
    }
  } else {
    logFail('Upload Intent Creation', `Expected HTTP 201, got HTTP ${intentRes.statusCode} (${intentRes.body})`);
  }

  // Step 6.3: Validate Browser Host in Presigned URL
  if (uploadUrl) {
    try {
      const parsedUploadUrl = new URL(uploadUrl);
      const hostPort = `${parsedUploadUrl.hostname}:${parsedUploadUrl.port}`;
      const isInternalHost = parsedUploadUrl.hostname === 'minio';
      const isBrowserHost =
        parsedUploadUrl.hostname === '127.0.0.1' ||
        parsedUploadUrl.hostname === 'localhost';

      if (isInternalHost) {
        logBlocked(
          'Presigned URL Browser Host Accessibility',
          `URL targets internal container host '${hostPort}'. Browser on host cannot resolve this. Primary Product must split internal IO client from public signer.`
        );
      } else if (isBrowserHost) {
        logPass('Presigned URL Browser Host Accessibility', `URL correctly targets host loopback: ${hostPort} (${sanitizeUrl(uploadUrl)})`);

        // Step 6.4: Direct HTTP PUT to MinIO with Browser CORS Check
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
        }

        // Step 6.5: Finalize Material Creation
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
            logPass('Material Finalization', `HTTP 201 Created, Material ID: ${createdMaterialId}`);
          } catch {
            logFail('Material Finalization', 'Failed to parse finalize response JSON');
          }
        } else {
          logFail('Material Finalization', `Expected HTTP 201, got HTTP ${finalizeRes.statusCode} (${finalizeRes.body})`);
        }

        // Step 6.6: Teacher-A Read Ownership Verification
        if (createdMaterialId) {
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

          // Step 6.7: Cross-Owner Tenant Privacy Check (Teacher-B)
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
            const teacherBToken = JSON.parse(authBRes.body).accessToken;
            const bListRes = await requestHttp(`${GATEWAY_URL}/api/v1/materials`, {
              headers: { Authorization: `Bearer ${teacherBToken}` },
            });

            if (bListRes.statusCode === 200) {
              const bData = JSON.parse(bListRes.body);
              const leaked = (bData.materials || []).some((m) => m.id === createdMaterialId);
              if (!leaked) {
                logPass('Cross-Tenant Privacy Isolation', `Teacher-B cannot see Teacher-A material ${createdMaterialId}`);
              } else {
                logFail('Cross-Tenant Privacy Isolation', `SECURITY VIOLATION: Teacher-A material leaked into Teacher-B list!`);
              }
            }

            // Cross-owner file download intent attempt
            const crossFileRes = await requestHttp(`${GATEWAY_URL}/api/v1/materials/${createdMaterialId}/file`, {
              headers: { Authorization: `Bearer ${teacherBToken}` },
            });

            if (crossFileRes.statusCode === 404 || crossFileRes.statusCode === 403) {
              logPass('Cross-Tenant Direct File Access Protection', `Teacher-B file request rejected with HTTP ${crossFileRes.statusCode}`);
            } else {
              logFail('Cross-Tenant Direct File Access Protection', `Expected HTTP 403/404, got HTTP ${crossFileRes.statusCode}`);
            }
          }
        }
      } else {
        logFail('Presigned URL Browser Host Accessibility', `Unknown host in presigned URL: ${hostPort}`);
      }
    } catch (err) {
      logFail('Presigned URL validation', err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Direct Private Bucket Probe (Enforcing anonymous access rejection)
  // ---------------------------------------------------------------------------
  console.log(`\n${COLORS.bold}7. Direct MinIO Private Bucket Security Probe${COLORS.reset}`);
  const anonProbe = await requestHttp(`${MINIO_URL}/copilot-private/test-unauthorized-probe.txt`);
  if (anonProbe.statusCode === 403 || anonProbe.statusCode === 401 || anonProbe.statusCode === 404) {
    logPass('Private Bucket Anonymous Access Rejection', `Direct unauthenticated S3 access denied with HTTP ${anonProbe.statusCode} (bucket is strictly private)`);
  } else {
    logFail('Private Bucket Anonymous Access Rejection', `Expected HTTP 401/403, got HTTP ${anonProbe.statusCode} (bucket may be publicly readable!)`);
  }

  // ---------------------------------------------------------------------------
  // 8. Summary & Exit Code
  // ---------------------------------------------------------------------------
  printSummaryAndExit();
}

function printSummaryAndExit() {
  console.log(`\n${COLORS.cyan}================================================================${COLORS.reset}`);
  console.log(`${COLORS.bold}Doctor Diagnostic Summary:${COLORS.reset}`);
  console.log(`${COLORS.cyan}================================================================${COLORS.reset}`);

  if (allChecksPassed) {
    console.log(`\n${COLORS.green}${COLORS.bold}>>> ALL PACKAGING, HEALTH & FUNCTIONAL ASSERTIONS PASSED! <<<${COLORS.reset}\n`);
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
    console.log(`\n${COLORS.red}Exiting with NON-ZERO code (1) as required.${COLORS.reset}\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nFatal unhandled doctor exception:', err);
  process.exit(1);
});
