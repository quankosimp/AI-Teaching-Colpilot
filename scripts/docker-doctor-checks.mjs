export function evaluateContainers(containers) {
  return ['postgres', 'minio', 'api', 'gateway'].map((service) => {
    const matches = containers.filter((c) => c.service === service);
    const c = matches[0];
    return {
      ok: matches.length === 1 && c.status === 'running' && c.health === 'healthy',
      title: `Required container ${service}`,
      detail: c ? `state=${c.status}, health=${c.health || 'none'}, count=${matches.length}` : 'missing',
    };
  });
}

export function deniedCors(response) {
  return (response.statusCode === 204 || response.statusCode === 403) && !response.headers['access-control-allow-origin'];
}
