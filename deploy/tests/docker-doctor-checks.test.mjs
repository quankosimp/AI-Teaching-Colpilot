import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateContainers, deniedCors } from '../../scripts/docker-doctor-checks.mjs';

test('requires each running healthy service, rejects unhealthy and missing', () => {
  const services = ['postgres', 'minio', 'api', 'gateway'].map(service => ({ service, status: 'running', health: 'healthy' }));
  assert.ok(evaluateContainers(services).every(x => x.ok));
  assert.equal(evaluateContainers(services.map(c => c.service === 'api' ? { ...c, health: 'unhealthy' } : c)).find(x => x.title.endsWith('api')).ok, false);
  assert.equal(evaluateContainers(services.filter(c => c.service !== 'gateway')).find(x => x.title.endsWith('gateway')).ok, false);
  assert.equal(evaluateContainers(services.map(c => c.service === 'api' ? { ...c, status: 'exited' } : c)).find(x => x.title.endsWith('api')).ok, false);
});
test('denied CORS requires HTTP 403 and no grant', () => {
  assert.equal(deniedCors({ statusCode: 403, headers: {} }), true);
  assert.equal(deniedCors({ statusCode: 204, headers: {} }), true);
  for (const statusCode of [0, 200, 404]) assert.equal(deniedCors({ statusCode, headers: {} }), false);
  assert.equal(deniedCors({ statusCode: 403, headers: { 'access-control-allow-origin': '*' } }), false);
});
