const { URL } = require('node:url');
function deployedApiUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      !host.includes('.') ||
      host.startsWith('[') ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^(0|10|127|169\.254|192\.168)\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error(
      'Supply the public HTTPS API origin, without credentials or /v1.',
    );
  }
}
async function verifyDeployedApi(value, fetchImpl = globalThis.fetch) {
  const origin = deployedApiUrl(value);
  const checks = [
    ['/v1/health/live', 200],
    ['/v1/health/ready', 200],
    ['/v1/characters', 401],
    ['/v1/wallet', 401],
  ];
  for (const [path, expected] of checks) {
    const response = await fetchImpl(origin + path, {
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(15000),
      headers: { Accept: 'application/json' },
    });
    if (response.status !== expected)
      throw new Error(
        `Deployment check failed: ${path} expected ${expected}, received ${response.status}.`,
      );
    if (expected === 200 && (await response.json()).status !== 'ok')
      throw new Error(
        `Deployment returned an invalid health response: ${path}.`,
      );
  }
  return {
    publicApiReachable: true,
    liveness: 200,
    databaseReadiness: 200,
    unauthenticatedCharacters: 401,
    unauthenticatedWallet: 401,
    readOnly: true,
  };
}
module.exports = { verifyDeployedApi };
if (require.main === module)
  verifyDeployedApi(process.argv[2])
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(
        error.message.startsWith('Supply ') ||
          error.message.startsWith('Deployment ')
          ? error.message
          : 'Deployment verification could not connect. Check the public URL, TLS and network access.',
      );
      process.exitCode = 1;
    });
