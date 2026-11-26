import 'reflect-metadata';
import { config } from 'dotenv';
import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { AiGateway } from '../src/ai/ai.gateway';
import { DatabaseService } from '../src/database.service';
import { guestDevelopmentUrl, guestFixture } from './guest-session-fixture';
config({ quiet: true });
jest.setTimeout(90000);

describe('chat history actions with real anonymous sessions and database', () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let database: DatabaseService;
  const ids: string[] = [],
    sessions: { id: string; token: string }[] = [];
  const fixtures: ReturnType<typeof guestFixture>[] = [];
  const character = randomUUID();
  let conversation: string;
  const reply = jest.fn(
    async (_persona: string, _context: { role: string; content: string }[]) => {
      void _persona;
      void _context;
      return {
        text: 'A fixture reply.',
        provider: 'deepseek' as const,
        model: 'test',
        responseId: randomUUID(),
        inputTokens: 1,
        outputTokens: 1,
      };
    },
  );
  beforeAll(async () => {
    if (
      process.env.SUPABASE_URL !== guestDevelopmentUrl ||
      !process.env.SUPABASE_SECRET_KEY ||
      !process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
      throw new Error('Explicit development configuration required');
    app = await createApp();
    app.useLogger(['warn', 'error']);
    await app.init();
    database = app.get(DatabaseService);
    await database.checkReadiness();
    const gateway = app.get(AiGateway);
    gateway.assertConfigured = () => undefined;
    gateway.reply = reply;
    for (let i = 0; i < 2; i++) {
      const fixture = guestFixture(
        guestDevelopmentUrl,
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        (id) => ids.push(id),
      );
      fixtures.push(fixture);
      const s = await fixture.restart().ensureSession();
      sessions.push({ id: s.user.id, token: s.access_token });
    }
    const r = await database.client.from('companion_characters').insert({
      id: character,
      name: 'Greeting integration fixture',
      archetype: 'Test role',
      bio: 'Public-only declaration',
      tags: [],
      system_prompt: 'Private character scenario',
      first_message: 'Hello, welcome!',
      published: true,
    });
    if (r.error) throw new Error('Greeting fixture setup failed');
  });
  afterAll(async () => {
    let failed = false;
    if (database) {
      for (const id of ids) {
        const r = await database.client
          .from('companion_users')
          .delete()
          .eq('id', id);
        failed ||= !!r.error;
      }
      const r = await database.client
        .from('companion_characters')
        .delete()
        .eq('id', character);
      failed ||= !!r.error;
      for (const id of ids) {
        const r = await database.client.auth.admin.deleteUser(id);
        failed ||= !!r.error;
      }
    }
    for (const f of fixtures) f.dispose();
    await app?.close();
    if (failed) throw new Error('Greeting fixture cleanup failed');
  });
  const auth = (i = 0) => ({ Authorization: `Bearer ${sessions[i]!.token}` });
  const open = (i = 0) =>
    request(app!.getHttpServer())
      .post('/v1/conversations')
      .set(auth(i))
      .send({ characterId: character });

  const history = (
    id: string,
    action: 'clear' | 'delete',
    key = randomUUID(),
    i = 0,
  ) =>
    request(app!.getHttpServer())
      .post(`/v1/conversations/${id}/history`)
      .set(auth(i))
      .send({ action, requestKey: key });
  let replacement: string;
  const clearKey = randomUUID();
  it('clears only the owned history and memory while preserving earned progress', async () => {
    conversation = (await open().expect(201)).body.id;
    await request(app!.getHttpServer())
      .post(`/v1/conversations/${conversation}/messages`)
      .set(auth())
      .send({ requestKey: randomUUID(), text: 'Temporary fixture text' })
      .expect(201);
    await history(conversation, 'clear', randomUUID(), 1).expect(404);
    const r = await history(conversation, 'clear', clearKey).expect(200);
    expect(r.headers['cache-control']).toBe('no-store');
    replacement = r.body.conversationId;
    expect(replacement).not.toBe(conversation);
    await request(app!.getHttpServer())
      .get(`/v1/conversations/${conversation}`)
      .set(auth())
      .expect(404);
    const timeline = await request(app!.getHttpServer())
      .get(`/v1/conversations/${replacement}/timeline`)
      .set(auth())
      .expect(200);
    expect(timeline.body.entries).toEqual([]);
    expect(timeline.body.progress.effectiveChatCount).toBe(1);
    expect((await open().expect(201)).body.greetingMessage).toBe('');
    const messages = await database.client
      .from('companion_messages')
      .select('id')
      .eq('conversation_id', conversation);
    expect(messages.error).toBeNull();
    expect(messages.data).toEqual([]);
    const memory = await database.client
      .from('companion_chat_memory')
      .select('conversation_id')
      .eq('conversation_id', conversation);
    expect(memory.error).toBeNull();
    expect(memory.data).toEqual([]);
  });
  it('retries idempotently without wiping a new chat and rejects conflicting or unauthenticated actions', async () => {
    await request(app!.getHttpServer())
      .post(`/v1/conversations/${replacement}/messages`)
      .set(auth())
      .send({ requestKey: randomUUID(), text: 'New fixture chat' })
      .expect(201);
    expect(
      (await history(conversation, 'clear', clearKey).expect(200)).body
        .conversationId,
    ).toBe(replacement);
    const timeline = await request(app!.getHttpServer())
      .get(`/v1/conversations/${replacement}/timeline`)
      .set(auth())
      .expect(200);
    expect(timeline.body.entries).toHaveLength(2);
    await history(conversation, 'delete', clearKey).expect(409);
    await request(app!.getHttpServer())
      .post(`/v1/conversations/${replacement}/history`)
      .send({ action: 'delete', requestKey: randomUUID() })
      .expect(401);
    await request(app!.getHttpServer())
      .post(`/v1/conversations/${replacement}/history`)
      .set(auth())
      .send({ action: 'delete', requestKey: 'invalid' })
      .expect(400);
  });
  it('deletes from Chats and reopens without old messages, greeting or lost progress', async () => {
    const key = randomUUID();
    expect(
      (await history(replacement, 'delete', key).expect(200)).body
        .conversationId,
    ).toBeNull();
    await history(replacement, 'delete', key).expect(200);
    const list = await request(app!.getHttpServer())
      .get('/v1/conversations')
      .set(auth())
      .expect(200);
    expect(
      list.body.conversations.some((c: { id: string }) =>
        [conversation, replacement].includes(c.id),
      ),
    ).toBe(false);
    const reopened = await open().expect(201);
    expect([conversation, replacement]).not.toContain(reopened.body.id);
    expect(reopened.body.greetingMessage).toBe('');
    const timeline = await request(app!.getHttpServer())
      .get(`/v1/conversations/${reopened.body.id}/timeline`)
      .set(auth())
      .expect(200);
    expect(timeline.body.entries).toEqual([]);
    expect(timeline.body.progress.effectiveChatCount).toBe(2);
  });
  it('prevents a reply already in flight from restoring cleared history', async () => {
    const id = (await open(1).expect(201)).body.id;
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    reply.mockImplementationOnce(async () => {
      entered();
      await gate;
      return {
        text: 'Late fixture reply',
        provider: 'deepseek' as const,
        model: 'test',
        responseId: randomUUID(),
        inputTokens: 1,
        outputTokens: 1,
      };
    });
    const sending = request(app!.getHttpServer())
      .post(`/v1/conversations/${id}/messages`)
      .set(auth(1))
      .send({ requestKey: randomUUID(), text: 'In flight fixture' })
      .then((r) => r);
    try {
      await started;
      const cleared = await history(id, 'clear', randomUUID(), 1).expect(200);
      release();
      expect([404, 409]).toContain((await sending).status);
      const timeline = await request(app!.getHttpServer())
        .get(`/v1/conversations/${cleared.body.conversationId}/timeline`)
        .set(auth(1))
        .expect(200);
      expect(timeline.body.entries).toEqual([]);
      expect(timeline.body.progress.effectiveChatCount).toBe(0);
      const messages = await database.client
        .from('companion_messages')
        .select('id')
        .eq('conversation_id', id);
      expect(messages.data).toEqual([]);
    } finally {
      release();
      await sending;
    }
  });
});
