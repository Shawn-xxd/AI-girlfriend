import { jest } from '@jest/globals';
import { MemoryService } from './memory.service';
import type { DatabaseService } from '../database.service';
import type { AiGateway } from '../ai/ai.gateway';
const keys = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'MEMORY_ENABLED',
  'MEMORY_BATCH_TURNS',
];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'unit-test';
  process.env.MEMORY_BATCH_TURNS = '2';
});
afterAll(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});
function fixture(options: { enabled?: boolean; due?: boolean } = {}) {
  process.env.MEMORY_ENABLED = options.enabled === false ? 'false' : 'true';
  const rpc = jest
    .fn<
      (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: null }>
    >()
    .mockImplementation(async (name) => ({
      error: null,
      data:
        name === 'companion_memory_context_v1'
          ? { summary: 'Old notes', messages: [] }
          : name === 'companion_claim_memory_v1'
            ? options.due === false
              ? null
              : {
                  generationId: '90000000-0000-4000-8000-000000000001',
                  previousSummary: 'Old notes',
                  messages: [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi' },
                  ],
                }
            : true,
    }));
  const summarize = jest
    .fn<AiGateway['summarize']>()
    .mockImplementation(async (_previous, _messages, report) => {
      await report('generation', {
        provider: 'deepseek',
        model: 'unit',
        responseId: 'unit',
        inputTokens: 1,
        outputTokens: 1,
      });
      return 'New notes';
    });
  const service = new MemoryService(
    { client: { rpc } } as unknown as DatabaseService,
    { summarize } as unknown as AiGateway,
  );
  return { rpc, summarize, service };
}
describe('opportunistic memory refresh', () => {
  it('does not call a model before the batch is due', async () => {
    const f = fixture({ due: false });
    f.service.schedule('actor', 'one');
    await f.service.drain();
    expect(f.summarize).not.toHaveBeenCalled();
  });
  it('saves approved notes and meters them under the same actor and generation', async () => {
    const f = fixture();
    f.service.schedule('actor', 'one');
    await f.service.drain();
    expect(f.rpc).toHaveBeenCalledWith(
      'companion_record_memory_usage_v1',
      expect.objectContaining({
        p_actor: 'actor',
        p_conversation: 'one',
        p_phase: 'generation',
      }),
    );
    expect(f.rpc).toHaveBeenCalledWith(
      'companion_finish_memory_v1',
      expect.objectContaining({
        p_actor: 'actor',
        p_conversation: 'one',
        p_summary: 'New notes',
      }),
    );
  });
  it('keeps old notes and releases the lease when summarization fails', async () => {
    const f = fixture();
    f.summarize.mockRejectedValue(new Error('private model detail'));
    f.service.schedule('actor', 'one');
    await expect(f.service.drain()).resolves.toBeUndefined();
    expect(f.rpc).toHaveBeenCalledWith(
      'companion_finish_memory_v1',
      expect.objectContaining({ p_summary: null }),
    );
    expect(await f.service.context('actor', 'one')).toEqual({
      summary: 'Old notes',
      messages: [],
    });
    expect(f.summarize).toHaveBeenCalledTimes(1);
  });
  it('coalesces a conversation and caps background work at two jobs', async () => {
    const f = fixture();
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.summarize.mockImplementation(async () => {
      entered();
      await gate;
      return 'New notes';
    });
    f.service.schedule('actor', 'one');
    await started;
    try {
      f.service.schedule('actor', 'one');
      f.service.schedule('actor', 'two');
      f.service.schedule('actor', 'three');
      await Promise.resolve();
      expect(
        f.rpc.mock.calls
          .filter((call) => call[0] === 'companion_claim_memory_v1')
          .map((call) => call[1].p_conversation),
      ).toEqual(['one', 'two']);
    } finally {
      release();
      await f.service.drain();
    }
  });
  it('can disable summary generation and omit stored notes without changing recent history', async () => {
    const f = fixture({ enabled: false });
    f.service.schedule('actor', 'one');
    await f.service.drain();
    expect(f.rpc).not.toHaveBeenCalled();
    expect(await f.service.context('actor', 'one')).toEqual({
      summary: '',
      messages: [],
    });
  });
});
