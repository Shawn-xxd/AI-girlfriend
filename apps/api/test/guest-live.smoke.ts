import 'reflect-metadata';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { createMobileApi } from '../../mobile/src/api/core';
import { createChatStream } from '../../mobile/src/api/stream';
import {
  currentUserSchema,
  characterListSchema,
  conversationSchema,
  messagePageSchema,
  chatReplySchema,
  type ChatStatus,
} from '@companion/shared';
import { createApp } from '../src/app';
import { DatabaseService } from '../src/database.service';
import { AiGateway } from '../src/ai/ai.gateway';
import {
  assertAnonymousAccess,
  guestDevelopmentUrl,
  guestFixture,
} from './guest-session-fixture';
config({ quiet: true });
describe('real anonymous client and backend acceptance', () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let admin: DatabaseService['client'] | undefined;
  const identities: string[] = [];
  let characterId: string | undefined;
  const fixtures: ReturnType<typeof guestFixture>[] = [];
  afterAll(async () => {
    fixtures.forEach((fixture) => fixture.dispose());
    let failed = false;
    if (admin) {
      if (identities.length)
        failed =
          Boolean(
            (await admin.from('companion_users').delete().in('id', identities))
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
      for (const id of identities)
        failed =
          Boolean((await admin.auth.admin.deleteUser(id)).error) || failed;
    }
    await app?.close();
    if (failed) throw new Error('Guest acceptance fixture cleanup failed');
  });
  it('creates an invisible identity, stores a real reply, restores the same identity and isolates another visitor', async () => {
    const url = process.env.SUPABASE_URL,
      key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (url !== guestDevelopmentUrl || !key || !process.env.SUPABASE_SECRET_KEY)
      throw new Error('Missing explicit development configuration.');
    await assertAnonymousAccess(url, key);
    app = await createApp();
    app.useLogger(['error', 'warn']);
    await app.listen(0, '127.0.0.1');
    const database = app.get(DatabaseService);
    await database.checkReadiness();
    app.get(AiGateway).assertConfigured();
    admin = database.client;
    const fixture = guestFixture(url, key, (id) => identities.push(id));
    fixtures.push(fixture);
    let manager = fixture.restart();
    const first = await manager.ensureSession();
    const actor = first.user.id;
    characterId = randomUUID();
    const inserted = await admin.from('companion_characters').insert({
      id: characterId,
      name: 'Anonymous Acceptance Fixture',
      archetype: 'Development',
      bio: 'A fictional adult AI character for a temporary acceptance test.',
      published: true,
      system_prompt:
        'Reply briefly and warmly. All interactions are non-explicit.',
    });
    if (inserted.error) throw new Error('Temporary character creation failed');
    const base = await app.getUrl();
    const api = () =>
      createMobileApi(base, () => manager.ensureSession(), fetch, true);
    const me = await api()('/v1/me', currentUserSchema);
    expect(me.id === actor).toBe(true);
    const catalog = await api()('/v1/characters', characterListSchema, {
      userId: actor,
    });
    expect(
      catalog.characters.some((character) => character.id === characterId),
    ).toBe(true);
    const conversation = await api()('/v1/conversations', conversationSchema, {
      userId: actor,
      method: 'POST',
      body: { characterId },
    });
    const body = {
      requestKey: randomUUID(),
      text: 'Hello! What is your idea of a relaxing weekend? Please keep it brief.',
    };
    const statuses: ChatStatus[] = [];
    const stream = createChatStream(
      base,
      () => manager.ensureSession(),
      fetch,
      true,
    );
    const result = await stream(actor, conversation.id, body, (status) =>
      statuses.push(status),
    );
    expect(statuses).toEqual(['checking', 'generating', 'checking', 'saving']);
    expect(result.messages[1]!.content.length > 0).toBe(true);
    // Rebuild the actual mobile session manager and its SDK against the same persisted storage.
    manager = fixture.restart();
    const restored = await manager.ensureSession();
    expect(restored.user.id === actor).toBe(true);
    expect(fixture.getSignups()).toBe(1);
    const history = await api()(
      `/v1/conversations/${conversation.id}/messages?limit=50`,
      messagePageSchema,
      { userId: actor },
    );
    expect(history.messages).toHaveLength(2);
    const replay = await api()(
      `/v1/conversations/${conversation.id}/messages`,
      chatReplySchema,
      { userId: actor, method: 'POST', body },
    );
    expect(replay.turnId === result.turnId).toBe(true);
    expect(replay.messages.map((message) => message.id)).toEqual(
      result.messages.map((message) => message.id),
    );
    const otherFixture = guestFixture(url, key, (id) => identities.push(id));
    fixtures.push(otherFixture);
    const other = await otherFixture.restart().ensureSession();
    const otherApi = createMobileApi(base, async () => other, fetch, true);
    await expect(
      otherApi(
        `/v1/conversations/${conversation.id}/messages`,
        messagePageSchema,
        { userId: other.user.id },
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    const attempts = await admin
      .from('companion_ai_attempts')
      .select('id', { head: true, count: 'exact' })
      .eq('turn_id', result.turnId);
    if (attempts.error) throw new Error('Unable to verify attempts');
    expect(attempts.count).toBe(1);
    const usage = await admin
      .from('companion_ai_usage_events')
      .select('phase,input_tokens,output_tokens')
      .eq('turn_id', result.turnId);
    if (usage.error) throw new Error('Unable to verify usage');
    expect(usage.data).toHaveLength(3);
    expect(
      usage.data?.find((item) => item.phase === 'generation')?.output_tokens,
    ).toBeGreaterThan(0);
  });
});
