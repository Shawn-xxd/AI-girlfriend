import 'reflect-metadata';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { DatabaseService } from '../src/database.service';
import { AiGateway } from '../src/ai/ai.gateway';
import { createAuthFixture } from './auth-fixture';
config({ quiet: true });
const developmentUrl = 'https://dxpiqttvtxjhmlvxstbb.supabase.co';
describe('real configured provider smoke (three bounded paid calls)', () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let admin: DatabaseService['client'] | undefined;
  let authId: string | undefined;
  let characterId: string | undefined;
  afterAll(async () => {
    let failed = false;
    if (admin) {
      if (authId)
        failed =
          Boolean(
            (await admin.from('companion_users').delete().eq('id', authId))
              .error,
          ) || failed;
      if (characterId)
        failed =
          Boolean(
            (
              await admin
                .from('companion_characters')
                .delete()
                .eq('id', characterId)
            ).error,
          ) || failed;
      if (authId)
        failed =
          Boolean((await admin.auth.admin.deleteUser(authId)).error) || failed;
    }
    await app?.close();
    if (failed) throw new Error('Live smoke fixture cleanup failed');
  });
  it('returns and persists a real moderated response, then replays without another turn', async () => {
    if (
      process.env.SUPABASE_URL !== developmentUrl ||
      !process.env.SUPABASE_SECRET_KEY
    ) {
      throw new Error(
        'Live smoke requires the explicit development Supabase project and key.',
      );
    }
    app = await createApp();
    await app.init();
    const database = app.get(DatabaseService);
    await database.checkReadiness();
    app.get(AiGateway).assertConfigured();
    admin = database.client;
    const session = await createAuthFixture(
      admin,
      developmentUrl,
      process.env.SUPABASE_SECRET_KEY,
      (id) => {
        authId = id;
      },
    );
    const id = randomUUID();
    const inserted = await admin.from('companion_characters').insert({
      id,
      name: 'Live Smoke Fixture',
      archetype: 'Test',
      bio: 'A fictional adult AI companion for testing',
      system_prompt: 'Reply warmly and briefly within non-explicit boundaries.',
      published: true,
    });
    if (inserted.error) throw new Error('Live smoke character setup failed');
    characterId = id;
    const opened = await request(app.getHttpServer())
      .post('/v1/conversations')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ characterId })
      .expect(201);
    const path = `/v1/conversations/${opened.body.id}/messages`,
      body = {
        requestKey: randomUUID(),
        text: 'Hello! How is your day going?',
      };
    const response = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${session.token}`)
      .send(body)
      .expect(201);
    expect(response.body.messages[1].role).toBe('assistant');
    expect(response.body.messages[1].content.length).toBeGreaterThan(0);
    const again = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${session.token}`)
      .send(body)
      .expect(201);
    expect(again.body).toEqual(response.body);
    const metering = await admin
      .from('companion_ai_usage_events')
      .select('phase,provider,model,input_tokens,output_tokens')
      .eq('turn_id', response.body.turnId);
    if (metering.error) throw new Error('Live smoke metering read failed');
    expect(metering.data).toHaveLength(3);
    expect(new Set(metering.data!.map((event) => event.phase)).size).toBe(3);
    const generation = metering.data!.find(
      (event) => event.phase === 'generation',
    )!;
    expect(generation.input_tokens).toBeGreaterThan(0);
    expect(generation.output_tokens).toBeGreaterThan(0);
  });
});
