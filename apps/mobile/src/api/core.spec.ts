import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { apiBaseUrl, createMobileApi } from './core';
const viewer = { access_token: 'test-only-token', user: { id: 'test-owner' } };
describe('authenticated mobile transport', () => {
  it('only allows HTTPS, or explicitly enabled local development HTTP', () => {
    expect(apiBaseUrl('https://api.example.test/')).toBe(
      'https://api.example.test',
    );
    expect(apiBaseUrl('http://127.0.0.1:3000', true)).toBe(
      'http://127.0.0.1:3000',
    );
    expect(() => apiBaseUrl('http://192.168.evil.test', true)).toThrow();
    for (const value of [
      undefined,
      'http://api.example.test',
      'https://user:password@api.example.test',
      'https://api.example.test?token=secret',
    ])
      expect(() => apiBaseUrl(value)).toThrow();
  });
  it('sends the actual token and preserves the retry request key', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const api = createMobileApi(
      'https://api.example.test',
      async () => viewer,
      async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response('{"ok":true}');
      },
    );
    const body = { requestKey: 'same-key', text: 'Hello' };
    for (let i = 0; i < 2; i++)
      await api('/v1/conversations', z.object({ ok: z.boolean() }), {
        method: 'POST',
        body,
        userId: 'test-owner',
      });
    expect(calls.map((c) => c.init?.body)).toEqual([
      JSON.stringify(body),
      JSON.stringify(body),
    ]);
    expect(calls[0]!.init?.headers).toMatchObject({
      Authorization: 'Bearer test-only-token',
    });
    expect(calls[0]!.init?.redirect).toBe('error');
  });
  it('rejects cache-owner mismatch before making a request', async () => {
    let count = 0;
    const api = createMobileApi(
      'https://api.example.test',
      async () => viewer,
      async () => {
        count++;
        return new Response('{}');
      },
    );
    await expect(
      api('/v1/me', z.object({}), { userId: 'another-owner' }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(count).toBe(0);
  });
  it('does not expose upstream bodies or automatically retry failures', async () => {
    let count = 0;
    const api = createMobileApi(
      'https://api.example.test',
      async () => viewer,
      async () => {
        count++;
        return new Response('sensitive upstream response', { status: 503 });
      },
    );
    await expect(api('/v1/me', z.object({}))).rejects.toMatchObject({
      code: 'unavailable',
      message: 'Connection interrupted. Please try again.',
    });
    expect(count).toBe(1);
  });
  it('rejects malformed success and unsafe paths', async () => {
    const api = createMobileApi(
      'https://api.example.test',
      async () => viewer,
      async () => new Response('{"id":false}'),
    );
    await expect(
      api('/v1/me', z.object({ id: z.string() })),
    ).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(api('/v1/../private', z.object({}))).rejects.toMatchObject({
      code: 'configuration',
    });
  });
  it('propagates cancellation and aborts a bounded request', async () => {
    const api = createMobileApi(
      'https://api.example.test',
      async () => viewer,
      async (_, init) =>
        new Promise((_, reject) => {
          const fail = () => reject(new Error('cancelled'));
          if (init?.signal?.aborted) fail();
          else init?.signal?.addEventListener('abort', fail, { once: true });
        }),
    );
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      api('/v1/me', z.object({}), { signal: cancelled.signal }),
    ).rejects.toMatchObject({ code: 'unavailable' });
    await expect(
      api('/v1/me', z.object({}), { timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });
});
it.each([
  [402, true, 'insufficient_diamonds'],
  [409, true, 'wallet_conflict'],
  [409, false, 'conflict'],
])(
  'keeps photo purchase errors separate from chat errors: %s',
  async (status, walletRequest, code) => {
    const api = createMobileApi(
      'https://api.example.test',
      async () => viewer,
      async () =>
        new Response('private upstream detail', { status: Number(status) }),
    );
    await expect(
      api('/v1/conversations/test/photos/test/unlock', z.object({}), {
        userId: viewer.user.id,
        walletRequest: Boolean(walletRequest),
      }),
    ).rejects.toMatchObject({ code });
  },
);
