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

describe('character greeting with real anonymous sessions and database', () => {
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
  it('opens idempotently with one persisted greeting and no AI call or chat count', async () => {
    const first = await open().expect(201);
    conversation = first.body.id;
    const results = await Promise.all([open().expect(201), open().expect(201)]);
    for (const r of results) {
      expect(r.body.id).toBe(conversation);
      expect(r.body.greetingMessage).toBe('Hello, welcome!');
    }
    expect(reply).not.toHaveBeenCalled();
    const timeline = await request(app!.getHttpServer())
      .get(`/v1/conversations/${conversation}/timeline`)
      .set(auth())
      .expect(200);
    expect(timeline.body.progress.effectiveChatCount).toBe(0);
    expect(timeline.body.entries).toEqual([]);
    const list = await request(app!.getHttpServer())
      .get('/v1/conversations')
      .set(auth())
      .expect(200);
    expect(
      list.body.conversations.find((c: { id: string }) => c.id === conversation)
        .lastMessage.content,
    ).toBe('Hello, welcome!');
  });
  it('keeps the original greeting, updates only new chats and scopes private character fields', async () => {
    const updated = await database.client
      .from('companion_characters')
      .update({ first_message: 'Updated welcome' })
      .eq('id', character);
    expect(updated.error).toBeNull();
    expect((await open().expect(201)).body.greetingMessage).toBe(
      'Hello, welcome!',
    );
    expect((await open(1).expect(201)).body.greetingMessage).toBe(
      'Updated welcome',
    );
    const detail = await request(app!.getHttpServer())
      .get(`/v1/conversations/${conversation}`)
      .set(auth())
      .expect(200);
    expect(detail.body.greetingMessage).toBe('Hello, welcome!');
    expect(detail.body.character.system_prompt).toBeUndefined();
    expect(detail.body.character.first_message).toBeUndefined();
    await request(app!.getHttpServer())
      .get(`/v1/conversations/${conversation}`)
      .set(auth(1))
      .expect(404);
  });
  it('includes the original greeting and private persona in generation, counting only a successful user/reply round', async () => {
    await request(app!.getHttpServer())
      .post(`/v1/conversations/${conversation}/messages`)
      .set(auth())
      .send({ requestKey: randomUUID(), text: 'Hi!' })
      .expect(201);
    expect(reply).toHaveBeenCalledTimes(1);
    const [persona, context] = reply.mock.calls[0]!;
    expect(persona).toContain('Role: Test role');
    expect(persona).toContain('Private character scenario');
    expect(persona).not.toContain('Public-only declaration');
    expect(context[0]).toEqual({
      role: 'assistant',
      content: 'Hello, welcome!',
    });
    const timeline = await request(app!.getHttpServer())
      .get(`/v1/conversations/${conversation}/timeline`)
      .set(auth())
      .expect(200);
    expect(timeline.body.progress.effectiveChatCount).toBe(1);
    expect(
      timeline.body.entries.filter((x: { kind: string }) => x.kind === 'text'),
    ).toHaveLength(2);
  });
});
