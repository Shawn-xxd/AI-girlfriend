import {
  DeepSeekAdapter,
  CompatibleChatAdapter,
} from './chat-completion.adapter';
import { OpenAiAdapter } from './openai.adapter';
import { DeepSeekModerator, OpenAiModerator } from './moderation.adapter';
import { selectChatProvider } from './ai.module';
import {
  chatPayload,
  fakeTransport,
  testConfig,
} from '../../test/provider-fixtures';
describe('model transports (no network calls)', () => {
  it('uses DeepSeek Chat Completions and only its own key', async () => {
    const transport = fakeTransport(chatPayload('Hello'));
    const provider = new DeepSeekAdapter(
      testConfig({
        AI_PROVIDER_API_KEY: 'other-vendor-unit-key',
        AI_BASE_URL: 'https://other.example.test/v1',
      }),
      transport.fetchImpl,
    );
    const result = await provider.generate('System', [
      { role: 'user', content: 'Hi' },
    ]);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]!.url).toBe(
      'https://api.deepseek.com/chat/completions',
    );
    expect(transport.calls[0]!.headers.get('authorization')).toBe(
      'Bearer deepseek-unit-test-only',
    );
    expect(transport.calls[0]!.body.model).toBe('deepseek-chat');
    expect(transport.calls[0]!.body).not.toHaveProperty('instructions');
    expect(result).toMatchObject({
      provider: 'deepseek',
      text: 'Hello',
      inputTokens: 10,
      outputTokens: 3,
    });
  });
  it('passes an independently configured model without a source-code change', async () => {
    const transport = fakeTransport(
      chatPayload('Hello', { model: 'future-deepseek-model' }),
    );
    await new DeepSeekAdapter(
      testConfig({ AI_MODEL: 'future-deepseek-model' }),
      transport.fetchImpl,
    ).generate('System', [{ role: 'user', content: 'Hi' }]);
    expect(transport.calls[0]!.body.model).toBe('future-deepseek-model');
  });
  it('supports a separately keyed HTTPS-compatible provider', async () => {
    const transport = fakeTransport(
      chatPayload('Hello', { model: 'other-model' }),
    );
    const provider = new CompatibleChatAdapter(
      testConfig({
        AI_PROVIDER: 'openai-compatible',
        AI_MODEL: 'other-model',
        AI_BASE_URL: 'https://models.example.test/v1',
        AI_COMPATIBLE_API_KEY: 'compatible-unit-key',
      }),
      transport.fetchImpl,
    );
    expect(
      (await provider.generate('System', [{ role: 'user', content: 'Hi' }]))
        .provider,
    ).toBe('openai-compatible');
    expect(transport.calls[0]!.url).toBe(
      'https://models.example.test/v1/chat/completions',
    );
    expect(transport.calls[0]!.headers.get('authorization')).toBe(
      'Bearer compatible-unit-key',
    );
  });
  it('does not fall back to another vendor or automatically retry errors', async () => {
    const transport = fakeTransport(
      {
        error: { message: 'private error text', type: 'authentication_error' },
      },
      401,
    );
    const deepseek = new DeepSeekAdapter(testConfig(), transport.fetchImpl);
    const selected = selectChatProvider(testConfig(), {
      deepseek,
      openai: new OpenAiAdapter(
        testConfig({ AI_PROVIDER_API_KEY: 'other-unit-key' }),
        transport.fetchImpl,
      ),
      'openai-compatible': new CompatibleChatAdapter(
        testConfig(),
        transport.fetchImpl,
      ),
    });
    await expect(
      selected.generate('System', [{ role: 'user', content: 'Hi' }]),
    ).rejects.toMatchObject({
      reason: 'provider_unavailable',
      safeCode: 'upstream_401',
    });
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]!.url).toContain('api.deepseek.com');
  });
  it('does not reuse an OpenAI key when a DeepSeek key is missing', () => {
    const transport = fakeTransport(chatPayload('Hello'));
    const provider = new DeepSeekAdapter(
      testConfig({
        DEEPSEEK_API_KEY: undefined,
        AI_PROVIDER_API_KEY: 'other-vendor-unit-key',
      }),
      transport.fetchImpl,
    );
    expect(() => provider.assertConfigured()).toThrow('not configured');
    expect(transport.calls).toHaveLength(0);
  });
  it('retains OpenAI Responses as a distinct adapter', async () => {
    const transport = fakeTransport({
      id: 'resp-unit',
      object: 'response',
      model: 'gpt-test',
      status: 'completed',
      output: [
        {
          type: 'message',
          id: 'msg-test',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Hello', annotations: [] }],
        },
      ],
      usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
    });
    const provider = new OpenAiAdapter(
      testConfig({
        AI_PROVIDER: 'openai',
        AI_MODEL: 'gpt-test',
        AI_PROVIDER_API_KEY: 'openai-unit-key',
      }),
      transport.fetchImpl,
    );
    expect(
      (await provider.generate('System', [{ role: 'user', content: 'Hi' }]))
        .provider,
    ).toBe('openai');
    expect(transport.calls[0]!.url).toBe('https://api.openai.com/v1/responses');
    expect(transport.calls[0]!.body.store).toBe(false);
  });
  it('rejects truncated content and keeps its usage metadata', async () => {
    const transport = fakeTransport(
      chatPayload('Partial', {
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Partial',
              reasoning_content: 'provider-private-field',
            },
            finish_reason: 'length',
          },
        ],
      }),
    );
    await expect(
      new DeepSeekAdapter(testConfig(), transport.fetchImpl).generate(
        'System',
        [{ role: 'user', content: 'Hi' }],
      ),
    ).rejects.toMatchObject({
      safeCode: 'invalid_completion',
      reply: { inputTokens: 10 },
    });
  });
});
describe('separate moderation adapters', () => {
  it('uses strict JSON classification with the independent moderation model', async () => {
    const transport = fakeTransport(chatPayload('{"allowed":true}'));
    const decision = await new DeepSeekModerator(
      testConfig({
        AI_MODEL: 'generation-model',
        MODERATION_MODEL: 'classifier-model',
      }),
      transport.fetchImpl,
    ).check('Hello');
    expect(decision.allowed).toBe(true);
    expect(transport.calls[0]!.body.model).toBe('classifier-model');
    expect(transport.calls[0]!.body.response_format).toEqual({
      type: 'json_object',
    });
  });
  it('never treats invalid, missing, or misleading classification as permission', async () => {
    for (const text of [
      'not json',
      '{}',
      '{"allowed":"true"}',
      '{"allowed":true,"unexpected":1}',
    ]) {
      const transport = fakeTransport(chatPayload(text));
      expect(
        (
          await new DeepSeekModerator(testConfig(), transport.fetchImpl).check(
            'Untrusted text',
          )
        ).allowed,
      ).toBeNull();
    }
  });
  it('supports a separate optional dedicated OpenAI moderation key', async () => {
    const transport = fakeTransport({
      id: 'mod-unit',
      model: 'omni-moderation-latest',
      results: [{ flagged: true }],
    });
    const moderator = new OpenAiModerator(
      testConfig({
        MODERATION_PROVIDER: 'openai',
        MODERATION_API_KEY: 'moderation-unit-key',
      }),
      transport.fetchImpl,
    );
    expect((await moderator.check('Test input')).allowed).toBe(false);
    expect(transport.calls[0]!.headers.get('authorization')).toBe(
      'Bearer moderation-unit-key',
    );
  });
});
