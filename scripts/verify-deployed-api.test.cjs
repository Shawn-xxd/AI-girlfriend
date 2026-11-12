const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifyDeployedApi } = require('./verify-deployed-api.cjs');
const origin = 'https://companion-api.example.com';
test('deployed readiness and both authorization boundaries are checked without sending credentials', async () => {
  const calls = [];
  const result = await verifyDeployedApi(origin, async (url, options) => {
    calls.push({ url, options });
    const health = url.includes('/health/');
    return { status: health ? 200 : 401, json: async () => ({ status: 'ok' }) };
  });
  assert.equal(result.readOnly, true);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.options.redirect, 'error');
    assert.deepEqual(call.options.headers, { Accept: 'application/json' });
  }
});
test('a live server with a missing migration does not count as deployable', async () => {
  await assert.rejects(
    verifyDeployedApi(origin, async (url) => ({
      status: url.endsWith('/ready') ? 503 : 200,
      json: async () => ({ status: 'ok' }),
    })),
    /ready expected 200, received 503/,
  );
});
test('a public wallet or malformed health response does not pass', async () => {
  await assert.rejects(
    verifyDeployedApi(origin, async (url) => ({
      status: url.endsWith('/characters') ? 401 : 200,
      json: async () => ({ status: 'ok' }),
    })),
    /wallet expected 401/,
  );
  await assert.rejects(
    verifyDeployedApi(origin, async () => ({
      status: 200,
      json: async () => ({ ok: true }),
    })),
    /invalid health/,
  );
});
test('loopback, LAN, cleartext and embedded credentials are rejected before network requests', async () => {
  for (const url of [
    'http://api.example.com',
    'https://127.0.0.1',
    'https://192.168.1.5',
    'https://[::1]',
    'https://user:password@api.example.com',
    'https://api.example.com/v1',
  ]) {
    await assert.rejects(
      verifyDeployedApi(url, () => {
        throw new Error('Network must not be called');
      }),
      /Supply/,
    );
  }
});
