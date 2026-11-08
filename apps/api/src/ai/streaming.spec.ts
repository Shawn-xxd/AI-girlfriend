import { DeepSeekAdapter } from './chat-completion.adapter';
import { OpenAiAdapter } from './openai.adapter';
import { testConfig } from '../../test/provider-fixtures';
function transport(events: unknown[], openai = false) {
  const calls: Record<string, unknown>[] = [];
  const fetchImpl: typeof fetch = async (_, init) => {
    calls.push(JSON.parse(String(init?.body)));
    const text =
      events
        .map(
          (event) =>
            `${openai ? 'event: ' + (event as { type: string }).type + '\n' : ''}data: ${JSON.stringify(event)}\n\n`,
        )
        .join('') + (openai ? '' : 'data: [DONE]\n\n');
    return new Response(text, {
      headers: { 'content-type': 'text/event-stream' },
    });
  };
  return { calls, fetchImpl };
}
const chunk = (
  content: string,
  finish: string | null = null,
  extra: Record<string, unknown> = {},
) => ({
  id: 'stream-unit',
  object: 'chat.completion.chunk',
  created: 0,
  model: 'deepseek-chat',
  choices: [
    {
      index: 0,
      delta: { content, reasoning_content: 'private reasoning' },
      finish_reason: finish,
    },
  ],
  ...extra,
});
describe('actual SDK streaming decoders without network calls', () => {
  it('requests real Chat Completions streaming, ignores reasoning and retains final usage', async () => {
    const t = transport([
      chunk('Hello '),
      chunk('there', 'stop'),
      chunk('', null, {
        choices: [],
        usage: { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 },
      }),
    ]);
    const reply = await new DeepSeekAdapter(testConfig(), t.fetchImpl).generate(
      'System',
      [{ role: 'user', content: 'Hello' }],
      { stream: true },
    );
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(reply).toMatchObject({
      text: 'Hello there',
      inputTokens: 11,
      outputTokens: 3,
    });
    expect(reply.text).not.toContain('private');
  });
  it('rejects unfinished, oversized or mismatched streams without a paid retry', async () => {
    for (const events of [
      [chunk('Partial')],
      [chunk('x'.repeat(12001), 'stop')],
      [chunk('First'), { ...chunk('Second', 'stop'), id: 'different-id' }],
    ]) {
      const t = transport(events);
      await expect(
        new DeepSeekAdapter(testConfig(), t.fetchImpl).generate(
          'System',
          [{ role: 'user', content: 'Hi' }],
          { stream: true },
        ),
      ).rejects.toMatchObject({
        reason: 'provider_unavailable',
        safeCode: 'invalid_completion',
      });
      expect(t.calls).toHaveLength(1);
    }
  });
  it('keeps unknown usage unknown when a provider omits its usage frame', async () => {
    const t = transport([chunk('Hello', 'stop')]);
    const result = await new DeepSeekAdapter(
      testConfig(),
      t.fetchImpl,
    ).generate('System', [{ role: 'user', content: 'Hi' }], { stream: true });
    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
  });
  it('supports the distinct OpenAI Responses stream without exposing deltas early', async () => {
    const response = {
      id: 'resp-stream',
      model: 'test-openai',
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello' }],
        },
      ],
      usage: { input_tokens: 4, output_tokens: 2 },
    };
    const t = transport(
      [
        { type: 'response.output_text.delta', delta: 'Hello' },
        { type: 'response.completed', response },
      ],
      true,
    );
    const result = await new OpenAiAdapter(
      testConfig({
        AI_MODEL: 'test-openai',
        AI_PROVIDER_API_KEY: 'unit-openai',
      }),
      t.fetchImpl,
    ).generate('System', [{ role: 'user', content: 'Hi' }], { stream: true });
    expect(result.text).toBe('Hello');
    expect(result.provider).toBe('openai');
    expect(t.calls[0]).toMatchObject({ stream: true, store: false });
  });
});
