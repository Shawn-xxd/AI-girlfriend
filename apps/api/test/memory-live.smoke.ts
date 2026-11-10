import 'reflect-metadata';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { chatReplySchema } from '@companion/shared';
import { createApp } from '../src/app';
import { DatabaseService } from '../src/database.service';
import { MemoryService } from '../src/conversations/memory.service';
import { createMobileApi } from '../../mobile/src/api/core';
import {
  guestFixture,
  guestDevelopmentUrl,
  assertAnonymousAccess,
} from './guest-session-fixture';
config({ quiet: true });
describe('real memory generation and recall', () => {
  const priorBatch = process.env.MEMORY_BATCH_TURNS,
    priorContext = process.env.AI_CONTEXT_TURNS,
    priorEnabled = process.env.MEMORY_ENABLED;
  let app: Awaited<ReturnType<typeof createApp>> | undefined,
    admin: DatabaseService['client'] | undefined,
    memory: MemoryService | undefined,
    fixture: ReturnType<typeof guestFixture> | undefined;
  const identities: string[] = [];
  const character = randomUUID();
  afterAll(async () => {
    await memory?.drain();
    fixture?.dispose();
    let failed = false;
    if (admin) {
      if (identities.length)
        failed =
          !!(await admin.from('companion_users').delete().in('id', identities))
            .error || failed;
      failed =
        !!(
          await admin.from('companion_characters').delete().eq('id', character)
        ).error || failed;
      for (const id of identities)
        failed = !!(await admin.auth.admin.deleteUser(id)).error || failed;
    }
    await app?.close();
    for (const [key, value] of [
      ['MEMORY_BATCH_TURNS', priorBatch],
      ['AI_CONTEXT_TURNS', priorContext],
      ['MEMORY_ENABLED', priorEnabled],
    ]) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
    if (failed) throw new Error('Memory live fixture cleanup failed');
  });
  it('summarizes fixture history and recalls facts outside the recent window using real models', async () => {
    if (
      process.env.SUPABASE_URL !== guestDevelopmentUrl ||
      !process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
      throw new Error('Development anonymous configuration required');
    process.env.MEMORY_BATCH_TURNS = '2';
    process.env.AI_CONTEXT_TURNS = '1';
    process.env.MEMORY_ENABLED = 'true';
    app = await createApp();
    app.useLogger(['error', 'warn']);
    await app.listen(0, '127.0.0.1');
    const database = app.get(DatabaseService);
    await database.checkReadiness();
    admin = database.client;
    const coordinator = app.get<MemoryService>(MemoryService);
    memory = coordinator;
    await assertAnonymousAccess(
      guestDevelopmentUrl,
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
    fixture = guestFixture(
      guestDevelopmentUrl,
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      (id) => identities.push(id),
    );
    const manager = fixture.restart();
    const actor = (await manager.ensureSession()).user.id;
    const inserted = await admin.from('companion_characters').insert({
      id: character,
      name: 'Memory Live Fixture',
      archetype: 'Test',
      bio: 'A temporary fictional adult AI companion.',
      published: true,
    });
    if (inserted.error) throw new Error('Fixture creation failed');
    const opened = await admin.rpc('companion_open_conversation_v1', {
      p_actor: actor,
      p_character: character,
    });
    if (opened.error || !opened.data)
      throw new Error('Conversation fixture failed');
    const conversation = opened.data;
    // Two completed setup pairs are explicit test fixtures, not billed AI replies.
    for (const [text, answer] of [
      ['My name is Alex. My favorite music is jazz.', 'Thanks for telling me.'],
      ['The sky is blue today.', 'A pleasant day.'],
    ]) {
      const claim = await admin.rpc('companion_begin_turn_v1', {
        p_actor: actor,
        p_conversation: conversation,
        p_key: randomUUID(),
        p_content: text!,
      });
      if (claim.error || !claim.data) throw new Error('Fixture turn failed');
      const completed = await admin.rpc('companion_complete_turn_v1', {
        p_actor: actor,
        p_turn: claim.data.turnId,
        p_generation: claim.data.generationId,
        p_text: answer!,
        p_model: 'test-fixture',
        p_response_id: 'test-fixture',
        p_input_tokens: 0,
        p_output_tokens: 0,
      });
      if (completed.error) throw new Error('Fixture completion failed');
    }
    coordinator.schedule(actor, conversation);
    await coordinator.drain();
    const context = await coordinator.context(actor, conversation);
    expect(context.summary).toMatch(/Alex/i);
    expect(context.summary).toMatch(/jazz/i);
    expect(JSON.stringify(context.messages)).not.toMatch(/Alex|jazz/i);
    const api = createMobileApi(
      await app.getUrl(),
      () => manager.ensureSession(),
      fetch,
      true,
    );
    const reply = await api(
      `/v1/conversations/${conversation}/messages`,
      chatReplySchema,
      {
        userId: actor,
        method: 'POST',
        body: {
          requestKey: randomUUID(),
          text: 'What is my name and what music do I like? Answer in one brief sentence.',
        },
      },
    );
    expect(reply.messages[1]!.content).toMatch(/Alex/i);
    expect(reply.messages[1]!.content).toMatch(/jazz/i);
    await coordinator.drain();
    const usage = await admin
      .from('companion_memory_usage')
      .select('phase,output_tokens')
      .eq('conversation_id', conversation);
    expect(usage.error).toBeNull();
    expect(usage.data).toHaveLength(2);
    expect(
      usage.data?.find((row) => row.phase === 'generation')?.output_tokens,
    ).toBeGreaterThan(0);
  });
});
