import { jest } from '@jest/globals';
import 'reflect-metadata';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { createAuthFixture } from './auth-fixture';
import { AiGateway } from '../src/ai/ai.gateway';
import { AiGenerationError } from '../src/ai/ai.types';
import request from 'supertest';
import { createApp } from '../src/app';
import { DatabaseService } from '../src/database.service';

config({ quiet: true });
const developmentUrl = 'https://dxpiqttvtxjhmlvxstbb.supabase.co';

describe('NestJS and real development Supabase', () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let database: DatabaseService;
  let admin: DatabaseService['client'];
  const authIds: string[] = [];
  const characterIds: string[] = [];
  const sessions: { id: string; token: string }[] = [];

  beforeAll(async () => {
    if (
      process.env.SUPABASE_URL !== developmentUrl ||
      !process.env.SUPABASE_SECRET_KEY
    ) {
      throw new Error(
        'Integration requires the explicit development project and server key. Never point this suite at production.',
      );
    }
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
    await database.checkReadiness();
    admin = database.client;
    for (let i = 0; i < 2; i++) {
      sessions.push(
        await createAuthFixture(
          admin,
          developmentUrl,
          process.env.SUPABASE_SECRET_KEY!,
          (id) => authIds.push(id),
        ),
      );
    }
    for (const published of [true, false]) {
      const id = `00000000${randomUUID().slice(8)}`;
      const { error } = await admin.from('companion_characters').insert({
        id,
        name: 'Integration Fixture',
        archetype: 'Test',
        bio: 'Temporary test fixture',
        tags: ['test'],
        published,
      });
      if (error) throw new Error('Test character creation failed');
      characterIds.push(id);
    }
  });

  afterAll(async () => {
    let cleanupFailed = false;
    if (admin) {
      if (authIds.length) {
        const result = await admin
          .from('companion_users')
          .delete()
          .in('id', authIds);
        cleanupFailed ||= Boolean(result.error);
      }
      if (characterIds.length) {
        const result = await admin
          .from('companion_characters')
          .delete()
          .in('id', characterIds);
        cleanupFailed ||= Boolean(result.error);
      }
      for (const id of authIds) {
        const result = await admin.auth.admin.deleteUser(id);
        cleanupFailed ||= Boolean(result.error);
      }
    }
    await app?.close();
    if (cleanupFailed)
      throw new Error(
        "Integration fixture cleanup failed; inspect only this run's synthetic records.",
      );
  });

  it('serves HTTP readiness from the formal migration ledger', async () => {
    await request(app!.getHttpServer())
      .get('/v1/health/live')
      .expect(200, { status: 'ok' });
    await request(app!.getHttpServer())
      .get('/v1/health/ready')
      .expect(200, { status: 'ok' });
  });
  it('rejects missing and invalid sessions', async () => {
    await request(app!.getHttpServer()).get('/v1/me').expect(401);
    await request(app!.getHttpServer()).get('/v1/characters').expect(401);
    await request(app!.getHttpServer())
      .get('/v1/me')
      .set('Authorization', 'Bearer invalid-session')
      .expect(401);
  });
  it('maps verified users idempotently and ignores another requested identity', async () => {
    for (const session of sessions) {
      const first = await request(app!.getHttpServer())
        .get('/v1/me')
        .set('Authorization', `Bearer ${session.token}`)
        .expect(200);
      const again = await request(app!.getHttpServer())
        .get(`/v1/me?id=${sessions.find((s) => s.id !== session.id)!.id}`)
        .set('Authorization', `Bearer ${session.token}`)
        .expect(200);
      expect(first.body.id).toBe(session.id);
      expect(again.body).toEqual(first.body);
    }
  });
  it('returns published characters without leaking publication/admin fields', async () => {
    const response = await request(app!.getHttpServer())
      .get('/v1/characters')
      .set('Authorization', `Bearer ${sessions[0]!.token}`)
      .expect(200);
    const characters = response.body.characters as Record<string, unknown>[];
    expect(characters.some((c) => c.id === characterIds[0])).toBe(true);
    expect(characters.some((c) => c.id === characterIds[1])).toBe(false);
    expect(
      characters.every((c) => !('published' in c) && !('created_at' in c)),
    ).toBe(true);
  });
  it('returns a sanitized 503 when database readiness fails', async () => {
    const spy = jest
      .spyOn(database, 'checkReadiness')
      .mockRejectedValueOnce(new Error('sensitive upstream detail'));
    try {
      const response = await request(app!.getHttpServer())
        .get('/v1/health/ready')
        .expect(503);
      expect(response.text).not.toContain('sensitive');
    } finally {
      spy.mockRestore();
    }
  });
  it('isolates conversations and validates pagination/body before generation', async () => {
    const actor = sessions[0]!,
      other = sessions[1]!;
    const opened = await request(app!.getHttpServer())
      .post('/v1/conversations')
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ characterId: characterIds[0] })
      .expect(201);
    const again = await request(app!.getHttpServer())
      .post('/v1/conversations')
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ characterId: characterIds[0] })
      .expect(201);
    expect(again.body.id).toBe(opened.body.id);
    await request(app!.getHttpServer())
      .get(`/v1/conversations/${opened.body.id}/messages`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);
    await request(app!.getHttpServer())
      .post(`/v1/conversations/${opened.body.id}/messages`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ requestKey: randomUUID(), text: 'Hello' })
      .expect(404);
    await request(app!.getHttpServer())
      .get(`/v1/conversations/${opened.body.id}/messages?limit=999`)
      .set('Authorization', `Bearer ${actor.token}`)
      .expect(400);
    await request(app!.getHttpServer())
      .post(`/v1/conversations/${opened.body.id}/messages`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ requestKey: randomUUID(), text: 'Hello', userId: other.id })
      .expect(400);
  });
  it('persists and replays one response with an explicit test-only model substitute', async () => {
    const actor = sessions[0]!;
    const gateway = app!.get(AiGateway);
    const ready = jest
      .spyOn(gateway, 'assertConfigured')
      .mockImplementation(() => {});
    const reply = jest.spyOn(gateway, 'reply').mockResolvedValue({
      text: 'Test-only provider reply',
      provider: 'deepseek',
      model: 'integration-substitute',
      responseId: 'test-only',
      inputTokens: 10,
      outputTokens: 4,
    });
    try {
      const opened = await request(app!.getHttpServer())
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${actor.token}`)
        .send({ characterId: characterIds[0] })
        .expect(201);
      const path = `/v1/conversations/${opened.body.id}/messages`;
      const body = { requestKey: randomUUID(), text: 'Integration test hello' };
      const first = await request(app!.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${actor.token}`)
        .send(body)
        .expect(201);
      const repeat = await request(app!.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${actor.token}`)
        .send(body)
        .expect(201);
      expect(repeat.body).toEqual(first.body);
      expect(reply).toHaveBeenCalledTimes(1);
      await request(app!.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${actor.token}`)
        .send({ ...body, text: 'Different' })
        .expect(409);
      const page = await request(app!.getHttpServer())
        .get(`${path}?limit=1`)
        .set('Authorization', `Bearer ${actor.token}`)
        .expect(200);
      expect(page.body.messages).toHaveLength(1);
      expect(page.body.nextBefore).toBeGreaterThan(0);
      const earlier = await request(app!.getHttpServer())
        .get(`${path}?limit=1&before=${page.body.nextBefore}`)
        .set('Authorization', `Bearer ${actor.token}`)
        .expect(200);
      expect(earlier.body.messages[0].role).toBe('user');
    } finally {
      ready.mockRestore();
      reply.mockRestore();
    }
  });
  it('retries a persisted provider failure without duplicating the user message (test substitute)', async () => {
    const actor = sessions[1]!,
      gateway = app!.get(AiGateway);
    const ready = jest
      .spyOn(gateway, 'assertConfigured')
      .mockImplementation(() => {});
    const reply = jest
      .spyOn(gateway, 'reply')
      .mockRejectedValueOnce(new AiGenerationError('provider_unavailable'))
      .mockResolvedValueOnce({
        text: 'Recovered test reply',
        provider: 'deepseek',
        model: 'integration-substitute',
        responseId: 'test-only',
        inputTokens: 10,
        outputTokens: 4,
      });
    try {
      const opened = await request(app!.getHttpServer())
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${actor.token}`)
        .send({ characterId: characterIds[0] })
        .expect(201);
      const path = `/v1/conversations/${opened.body.id}/messages`,
        body = { requestKey: randomUUID(), text: 'Retry fixture' };
      await request(app!.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${actor.token}`)
        .send(body)
        .expect(503);
      const failed = await request(app!.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${actor.token}`)
        .expect(200);
      expect(failed.body.messages).toHaveLength(1);
      expect(failed.body.messages[0].state).toBe('failed');
      const recovered = await request(app!.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${actor.token}`)
        .send(body)
        .expect(201);
      expect(recovered.body.messages).toHaveLength(2);
      expect(recovered.body.messages[0].id).toBe(failed.body.messages[0].id);
    } finally {
      ready.mockRestore();
      reply.mockRestore();
    }
  });
  it('returns owned conversation details and list summaries without private fields', async () => {
    const actor = sessions[0]!,
      other = sessions[1]!;
    const opened = await request(app!.getHttpServer())
      .post('/v1/conversations')
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ characterId: characterIds[0] })
      .expect(201);
    const detail = await request(app!.getHttpServer())
      .get(`/v1/conversations/${opened.body.id}`)
      .set('Authorization', `Bearer ${actor.token}`)
      .expect(200);
    expect(detail.body.character.id).toBe(characterIds[0]);
    expect(detail.body.character).not.toHaveProperty('system_prompt');
    await request(app!.getHttpServer())
      .get(`/v1/conversations/${opened.body.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);
    const list = await request(app!.getHttpServer())
      .get('/v1/conversations')
      .set('Authorization', `Bearer ${actor.token}`)
      .expect(200);
    const item = list.body.conversations.find(
      (row: { id: string }) => row.id === opened.body.id,
    );
    expect(item.character.name).toBe('Integration Fixture');
    expect(item.lastMessage.content).toBe('Test-only provider reply');
    expect(item.character).not.toHaveProperty('system_prompt');
  });
  it('streams persisted results with an explicit model substitute and replays the same turn', async () => {
    const actor = sessions[0]!,
      other = sessions[1]!,
      gateway = app!.get(AiGateway);
    const ready = jest
      .spyOn(gateway, 'assertConfigured')
      .mockImplementation(() => {});
    const reply = jest
      .spyOn(gateway, 'reply')
      .mockImplementation(async (_persona, _context, _usage, options) => {
        options?.onStatus?.('generating');
        return {
          text: 'Stream integration substitute',
          provider: 'deepseek',
          model: 'integration-substitute',
          responseId: 'test-stream',
          inputTokens: 4,
          outputTokens: 3,
        };
      });
    try {
      const opened = await request(app!.getHttpServer())
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${actor.token}`)
        .send({ characterId: characterIds[0] })
        .expect(201);
      const path = `/v1/conversations/${opened.body.id}/messages/stream`,
        body = { requestKey: randomUUID(), text: 'Streaming test' };
      await request(app!.getHttpServer()).post(path).send(body).expect(401);
      await request(app!.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${other.token}`)
        .send(body)
        .expect(404);
      await request(app!.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${actor.token}`)
        .send({ ...body, userId: other.id })
        .expect(400);
      expect(reply).not.toHaveBeenCalled();
      const first = await request(app!.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${actor.token}`)
        .send(body)
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);
      const parse = (wire: string) =>
        wire
          .split('\n\n')
          .filter((frame) => frame.startsWith('data:'))
          .map((frame) => JSON.parse(frame.slice(5)));
      const events = parse(first.text);
      expect(events.some((event) => event.type === 'status')).toBe(true);
      const completed = events.find((event) => event.type === 'completed');
      expect(completed.reply.messages[1].content).toBe(
        'Stream integration substitute',
      );
      const replay = await request(app!.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${actor.token}`)
        .send(body)
        .expect(200);
      expect(
        parse(replay.text).find((event) => event.type === 'completed'),
      ).toEqual(completed);
      expect(reply).toHaveBeenCalledTimes(1);
      const history = await request(app!.getHttpServer())
        .get(`/v1/conversations/${opened.body.id}/messages`)
        .set('Authorization', `Bearer ${actor.token}`)
        .expect(200);
      expect(
        history.body.messages.filter(
          (row: { requestKey: string }) => row.requestKey === body.requestKey,
        ),
      ).toHaveLength(2);
    } finally {
      ready.mockRestore();
      reply.mockRestore();
    }
  });
});
