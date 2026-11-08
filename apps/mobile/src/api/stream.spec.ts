import { describe, it, expect } from '@jest/globals';
import { createChatStream } from './stream';
import {
  owner,
  conversation,
  requestKey,
  reply,
} from '../../../../tests/fixtures/chat';
const identity = { access_token: 'unit-only-token', user: { id: owner } };
const body = { requestKey, text: 'Hello' };
function sse(parts: string[]) {
  return new Response(
    new ReadableStream({
      start(c) {
        for (const part of parts) c.enqueue(new TextEncoder().encode(part));
        c.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}
const complete = `data: ${JSON.stringify({ type: 'completed', reply })}\r\n\r\n`;
describe('authenticated chat streaming', () => {
  it('parses split frames and multibyte content and keeps the request key', async () => {
    const statuses: string[] = [];
    let calls = 0;
    const stream = createChatStream(
      'https://api.example.test',
      async () => identity,
      async (url, init) => {
        calls++;
        expect(url).toContain(
          `/v1/conversations/${conversation}/messages/stream`,
        );
        expect(init.headers.Authorization).toBe('Bearer unit-only-token');
        expect(JSON.parse(init.body)).toEqual(body);
        const bytes = new TextEncoder().encode(
          `: heartbeat\r\n\r\ndata: {"type":"status","status":"generating"}\r\n\r\n${complete}`,
        );
        return new Response(
          new ReadableStream({
            start(c) {
              for (let i = 0; i < bytes.length; i += 7)
                c.enqueue(bytes.slice(i, i + 7));
              c.close();
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        );
      },
    );
    expect(
      await stream(owner, conversation, body, (status) =>
        statuses.push(status),
      ),
    ).toEqual(reply);
    expect(statuses).toEqual(['generating']);
    expect(calls).toBe(1);
  });
  it('refuses another owner before making a request', async () => {
    let calls = 0;
    const stream = createChatStream(
      'https://api.example.test',
      async () => identity,
      async () => {
        calls++;
        return sse([complete]);
      },
    );
    await expect(
      stream('other', conversation, body, () => {}),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(calls).toBe(0);
  });
  it('rejects truncation, oversized frames and responses belonging to another request', async () => {
    for (const parts of [
      [`data: {"type":"status","status":"generating"}\n\n`],
      ['x'.repeat(262145)],
      [complete.replaceAll(requestKey, '40000000-0000-4000-8000-000000000002')],
    ]) {
      const stream = createChatStream(
        'https://api.example.test',
        async () => identity,
        async () => sse(parts),
      );
      await expect(
        stream(owner, conversation, body, () => {}),
      ).rejects.toBeInstanceOf(Error);
    }
  });
  it('maps safe error events and never exposes upstream body details or retries', async () => {
    let calls = 0;
    const stream = createChatStream(
      'https://api.example.test',
      async () => identity,
      async () => {
        calls++;
        return sse(['data: {"type":"error","status":422}\n\n']);
      },
    );
    await expect(
      stream(owner, conversation, body, () => {}),
    ).rejects.toMatchObject({ code: 'rejected' });
    expect(calls).toBe(1);
    const failure = createChatStream(
      'https://api.example.test',
      async () => identity,
      async () => new Response('private provider error', { status: 503 }),
    );
    await expect(
      failure(owner, conversation, body, () => {}),
    ).rejects.toMatchObject({
      message: 'Connection interrupted. Please try again.',
    });
  });
  it('cancels a bounded stream rather than silently starting a new generation', async () => {
    const stream = createChatStream(
      'https://api.example.test',
      async () => identity,
      async (_, init) =>
        new Response(
          new ReadableStream({
            start(c) {
              init.signal.addEventListener(
                'abort',
                () => c.error(new Error('cancelled')),
                { once: true },
              );
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    await expect(
      stream(owner, conversation, body, () => {}, undefined, 10),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });
});
