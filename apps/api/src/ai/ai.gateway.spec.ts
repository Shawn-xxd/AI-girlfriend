import { jest } from '@jest/globals';
import { AiGateway } from './ai.gateway';
import {
  AiGenerationError,
  type GeneratedReply,
  type ModerationDecision,
  type UsagePhase,
  type UsageRecord,
} from './ai.types';
const generated: GeneratedReply = {
  text: 'Test reply',
  provider: 'deepseek',
  model: 'unit-test',
  responseId: 'test',
  inputTokens: 10,
  outputTokens: 3,
};
const usage: UsageRecord = {
  provider: 'deepseek',
  model: 'unit-classifier',
  responseId: 'mod-test',
  inputTokens: 5,
  outputTokens: 1,
};
function fixture() {
  const provider = {
    assertConfigured: jest.fn(),
    generate: jest.fn<() => Promise<GeneratedReply>>(),
  };
  const moderator = {
    assertConfigured: jest.fn(),
    check: jest.fn<(text: string) => Promise<ModerationDecision>>(),
  };
  return { provider, moderator, gateway: new AiGateway(provider, moderator) };
}
describe('provider-independent content gate', () => {
  it('does not generate for rejected input, and records classifier usage', async () => {
    const { provider, moderator, gateway } = fixture();
    moderator.check.mockResolvedValue({ allowed: false, usage });
    const recorded = jest
      .fn<(phase: UsagePhase, usage: UsageRecord) => Promise<void>>()
      .mockResolvedValue(undefined);
    await expect(
      gateway.reply(
        'Adult character',
        [{ role: 'user', content: 'Test input' }],
        recorded,
      ),
    ).rejects.toMatchObject({ reason: 'content_rejected' });
    expect(provider.generate).not.toHaveBeenCalled();
    expect(recorded).toHaveBeenCalledWith('input_moderation', usage);
  });
  it('records separate model and provider usage for all three phases', async () => {
    const { provider, moderator, gateway } = fixture();
    moderator.check.mockResolvedValue({ allowed: true, usage });
    provider.generate.mockResolvedValue(generated);
    const recorded = jest
      .fn<(phase: UsagePhase, usage: UsageRecord) => Promise<void>>()
      .mockResolvedValue(undefined);
    expect(
      await gateway.reply(
        'Adult character',
        [{ role: 'user', content: 'Hello' }],
        recorded,
      ),
    ).toEqual(generated);
    expect(recorded.mock.calls.map((c) => c[0])).toEqual([
      'input_moderation',
      'generation',
      'output_moderation',
    ]);
    expect(recorded.mock.calls[1]![1].model).toBe(generated.model);
    expect(moderator.check.mock.calls.map((c) => c[0])).toEqual([
      'Hello',
      generated.text,
    ]);
  });
  it('rejects flagged output and preserves the billed generation', async () => {
    const { provider, moderator, gateway } = fixture();
    moderator.check
      .mockResolvedValueOnce({ allowed: true, usage })
      .mockResolvedValueOnce({ allowed: false, usage });
    provider.generate.mockResolvedValue(generated);
    await expect(
      gateway.reply('Adult character', [{ role: 'user', content: 'Hello' }]),
    ).rejects.toMatchObject({ reason: 'content_rejected', reply: generated });
  });
  it('fails closed on an indeterminate classifier response', async () => {
    const { provider, moderator, gateway } = fixture();
    moderator.check.mockResolvedValue({ allowed: null, usage });
    await expect(
      gateway.reply('Adult character', [{ role: 'user', content: 'Hello' }]),
    ).rejects.toMatchObject({
      reason: 'provider_unavailable',
      safeCode: 'invalid_moderation',
    });
    expect(provider.generate).not.toHaveBeenCalled();
  });
  it('does not expose transport error messages or generate without moderation', async () => {
    const { provider, moderator, gateway } = fixture();
    moderator.check.mockRejectedValue(new Error('private provider detail'));
    await expect(
      gateway.reply('Adult character', [{ role: 'user', content: 'Hello' }]),
    ).rejects.toEqual(new AiGenerationError('provider_unavailable'));
    expect(provider.generate).not.toHaveBeenCalled();
  });
  it('records usage for an incomplete generation and never returns it', async () => {
    const { provider, moderator, gateway } = fixture();
    moderator.check.mockResolvedValue({ allowed: true, usage });
    provider.generate.mockRejectedValue(
      new AiGenerationError(
        'provider_unavailable',
        generated,
        'invalid_completion',
      ),
    );
    const recorded = jest
      .fn<(phase: UsagePhase, usage: UsageRecord) => Promise<void>>()
      .mockResolvedValue(undefined);
    await expect(
      gateway.reply(
        'Adult character',
        [{ role: 'user', content: 'Hello' }],
        recorded,
      ),
    ).rejects.toMatchObject({ safeCode: 'invalid_completion' });
    expect(recorded).toHaveBeenCalledWith('generation', generated);
  });
  it('retries only an idempotent usage write, never the paid model call', async () => {
    const { provider, moderator, gateway } = fixture();
    moderator.check.mockResolvedValue({ allowed: true, usage });
    provider.generate.mockResolvedValue(generated);
    const recorded = jest
      .fn<(phase: UsagePhase, usage: UsageRecord) => Promise<void>>()
      .mockRejectedValueOnce(new Error('lost metering response'))
      .mockResolvedValue(undefined);
    await gateway.reply(
      'Adult character',
      [{ role: 'user', content: 'Hello' }],
      recorded,
    );
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(recorded.mock.calls.map((c) => c[0])).toEqual([
      'input_moderation',
      'input_moderation',
      'generation',
      'output_moderation',
    ]);
  });
  it('does not proceed when metering remains unavailable', async () => {
    const { provider, moderator, gateway } = fixture();
    moderator.check.mockResolvedValue({ allowed: true, usage });
    const recorded = jest
      .fn<(phase: UsagePhase, usage: UsageRecord) => Promise<void>>()
      .mockRejectedValue(new Error('metering unavailable'));
    await expect(
      gateway.reply(
        'Adult character',
        [{ role: 'user', content: 'Hello' }],
        recorded,
      ),
    ).rejects.toMatchObject({ safeCode: 'usage_record_unavailable' });
    expect(recorded).toHaveBeenCalledTimes(2);
    expect(provider.generate).not.toHaveBeenCalled();
  });
});
