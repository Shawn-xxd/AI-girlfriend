import { parseConfig } from '../src/config';
export function testConfig(extra: Record<string, unknown> = {}) {
  return parseConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'unit-test-only',
    AI_MODEL: 'deepseek-chat',
    DEEPSEEK_API_KEY: 'deepseek-unit-test-only',
    ...extra,
  });
}
export function chatPayload(
  content: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id: 'chat-unit-test',
    object: 'chat.completion',
    created: 0,
    model: 'deepseek-chat',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
    ...extra,
  };
}
export function fakeTransport(payload: unknown, status = 200) {
  const calls: {
    url: string;
    headers: Headers;
    body: Record<string, unknown>;
  }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    const raw =
      typeof init?.body === 'string'
        ? init.body
        : input instanceof Request
          ? await input.clone().text()
          : '{}';
    calls.push({
      url,
      headers,
      body: JSON.parse(raw) as Record<string, unknown>,
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { calls, fetchImpl };
}
