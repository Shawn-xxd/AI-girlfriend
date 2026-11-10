import 'reflect-metadata';
import { config } from 'dotenv';
import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { DatabaseService } from '../src/database.service';
import { AiGateway } from '../src/ai/ai.gateway';
import { MemoryService } from '../src/conversations/memory.service';
import {
  guestFixture,
  guestDevelopmentUrl,
  assertAnonymousAccess,
} from './guest-session-fixture';
config({ quiet: true });
jest.setTimeout(90000);
describe('real Supabase memory and chat integration (AI substitute)', () => {
  const previousBatch = process.env.MEMORY_BATCH_TURNS,
    previousContext = process.env.AI_CONTEXT_TURNS,
    previousEnabled = process.env.MEMORY_ENABLED;
  let app: Awaited<ReturnType<typeof createApp>> | undefined,
    admin: DatabaseService['client'] | undefined,
    memory: MemoryService | undefined;
  const identities: string[] = [],
    fixtures: ReturnType<typeof guestFixture>[] = [];
  const characters = [randomUUID(), randomUUID()],
    sessions: { id: string; token: string }[] = [];
  let conversation: string;
  const sent: { requestKey: string; text: string }[] = [];
  const reply = jest.fn<AiGateway['reply']>().mockResolvedValue({
    text: 'Approved fixture reply.',
    provider: 'deepseek',
    model: 'test',
    responseId: 'test',
    inputTokens: 1,
    outputTokens: 1,
  });
  const summarize = jest
    .fn<AiGateway['summarize']>()
    .mockImplementation(async (_previous, _messages, report) => {
      const usage = {
        provider: 'deepseek' as const,
        model: 'summary-test',
        responseId: 'summary-test',
        inputTokens: 10,
        outputTokens: 4,
      };
      await report('generation', usage);
      await report('output_moderation', usage);
      return 'User is Alex and enjoys jazz.';
    });
  const send = async (text: string) => {
    const body = { requestKey: randomUUID(), text };
    sent.push(body);
    await request(app!.getHttpServer())
      .post(`/v1/conversations/${conversation}/messages`)
      .set('Authorization', `Bearer ${sessions[0]!.token}`)
      .send(body)
      .expect(201);
  };
  beforeAll(async () => {
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
    await app.init();
    const database = app.get(DatabaseService);
    await database.checkReadiness();
    admin = database.client;
    memory = app.get(MemoryService);
    await assertAnonymousAccess(
      guestDevelopmentUrl,
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
    for (let i = 0; i < 2; i++) {
      const fixture = guestFixture(
        guestDevelopmentUrl,
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        (id) => identities.push(id),
      );
      fixtures.push(fixture);
      const session = await fixture.restart().ensureSession();
      sessions.push({ id: session.user.id, token: session.access_token });
    }
    const inserted = await admin.from('companion_characters').insert(
      characters.map((id) => ({
        id,
        name: 'Memory Integration Fixture',
        archetype: 'Test',
        bio: 'Temporary fictional adult fixture.',
        published: true,
      })),
    );
    if (inserted.error) throw new Error('Character setup failed');
    conversation = (
      await request(app.getHttpServer())
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${sessions[0]!.token}`)
        .send({ characterId: characters[0] })
        .expect(201)
    ).body.id;
    const ai = app.get(AiGateway);
    jest.spyOn(ai, 'assertConfigured').mockImplementation(() => undefined);
    jest.spyOn(ai, 'reply').mockImplementation(reply);
    jest.spyOn(ai, 'summarize').mockImplementation(summarize);
  });
  afterAll(async () => {
    await memory?.drain();
    fixtures.forEach((f) => f.dispose());
    let failed = false;
    if (admin) {
      if (identities.length)
        failed =
          !!(await admin.from('companion_users').delete().in('id', identities))
            .error || failed;
      failed =
        !!(
          await admin.from('companion_characters').delete().in('id', characters)
        ).error || failed;
      for (const id of identities)
        failed = !!(await admin.auth.admin.deleteUser(id)).error || failed;
    }
    await app?.close();
    for (const [key, value] of [
      ['MEMORY_BATCH_TURNS', previousBatch],
      ['AI_CONTEXT_TURNS', previousContext],
      ['MEMORY_ENABLED', previousEnabled],
    ]) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
    if (failed) throw new Error('Memory integration cleanup failed');
  });
  it('waits for a batch, persists notes and records both usage phases', async () => {
    await send('My name is Alex and I enjoy jazz.');
    await memory!.drain();
    expect(summarize).not.toHaveBeenCalled();
    await send('The weather is sunny.');
    await memory!.drain();
    expect(summarize).toHaveBeenCalledTimes(1);
    const stored = await admin!
      .from('companion_chat_memory')
      .select('summary,through_sequence')
      .eq('conversation_id', conversation)
      .single();
    expect(stored.error).toBeNull();
    expect(stored.data).toMatchObject({
      summary: 'User is Alex and enjoys jazz.',
      through_sequence: 4,
    });
    const usage = await admin!
      .from('companion_memory_usage')
      .select('phase')
      .eq('conversation_id', conversation);
    expect(usage.error).toBeNull();
    expect(usage.data?.map((row) => row.phase).sort()).toEqual([
      'generation',
      'output_moderation',
    ]);
  });
  it('loads old notes separately from recent context, and replay does not resummarize', async () => {
    const context = await memory!.context(sessions[0]!.id, conversation);
    expect(context.summary).toContain('Alex');
    expect(JSON.stringify(context.messages)).not.toContain('Alex');
    await request(app!.getHttpServer())
      .post(`/v1/conversations/${conversation}/messages`)
      .set('Authorization', `Bearer ${sessions[0]!.token}`)
      .send(sent[0])
      .expect(201);
    await memory!.drain();
    expect(summarize).toHaveBeenCalledTimes(1);
    await send('What music do I enjoy?');
    await memory!.drain();
    expect(reply.mock.calls.at(-1)![3]).toMatchObject({
      memory: 'User is Alex and enjoys jazz.',
    });
  });
  it('isolates users/characters and denies direct public access', async () => {
    for (const [actor, character] of [
      [sessions[1]!.id, characters[0]!],
      [sessions[0]!.id, characters[1]!],
    ]) {
      const opened = await admin!.rpc('companion_open_conversation_v1', {
        p_actor: actor!,
        p_character: character!,
      });
      expect(opened.error).toBeNull();
      expect((await memory!.context(actor!, opened.data!)).summary).toBe('');
    }
    await request(app!.getHttpServer())
      .post(`/v1/conversations/${conversation}/messages`)
      .set('Authorization', `Bearer ${sessions[1]!.token}`)
      .send({ requestKey: randomUUID(), text: 'Foreign read' })
      .expect(404);
    const response = await fetch(
      guestDevelopmentUrl + '/rest/v1/companion_chat_memory?select=summary',
      {
        headers: {
          apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          Authorization: `Bearer ${sessions[0]!.token}`,
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    expect(response.status).toBe(403);
    await response.text();
  });
  it('keeps chat successful when updating fails and clears notes on history deletion', async () => {
    summarize.mockRejectedValueOnce(new Error('Summary transport fixture'));
    await send('A fourth successful turn.');
    await memory!.drain();
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(
      (await memory!.context(sessions[0]!.id, conversation)).summary,
    ).toContain('Alex');
    const removed = await admin!
      .from('companion_messages')
      .delete()
      .eq('conversation_id', conversation)
      .eq('role', 'user');
    expect(removed.error).toBeNull();
    expect(await memory!.context(sessions[0]!.id, conversation)).toEqual({
      summary: '',
      messages: [],
    });
    const progress = await admin!.rpc('companion_progress_snapshot_v1', {
      p_actor: sessions[0]!.id,
      p_conversation: conversation,
    });
    expect(progress.error).toBeNull();
    expect(progress.data).toMatchObject({ effectiveChatCount: 4 });
  });
});
