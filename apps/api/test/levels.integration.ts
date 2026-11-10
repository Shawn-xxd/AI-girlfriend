import 'reflect-metadata';
import { config } from 'dotenv';
import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  timelinePageSchema,
  levelGallerySchema,
  photoAccessSchema,
} from '@companion/shared';
import { createApp } from '../src/app';
import { DatabaseService } from '../src/database.service';
import { AiGateway } from '../src/ai/ai.gateway';
import { AiGenerationError } from '../src/ai/ai.types';
import { photoBucket } from '../src/conversations/level-photos.service';
import {
  assertAnonymousAccess,
  guestDevelopmentUrl,
  guestFixture,
} from './guest-session-fixture';
config({ quiet: true });
jest.setTimeout(90000);
describe('level rewards with real anonymous SDK, database and private storage (AI substitute)', () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let admin: DatabaseService['client'] | undefined;
  const identities: string[] = [],
    fixtures: ReturnType<typeof guestFixture>[] = [],
    photos = [randomUUID(), randomUUID(), randomUUID()];
  const character = randomUUID(),
    objects = photos.map((id) => `${character}/${id}.png`);
  const sessions: { id: string; token: string }[] = [];
  let conversation: string, otherConversation: string;
  let mode: 'success' | 'failure' | 'reject' = 'success';
  const reply = jest.fn(async () => {
    if (mode === 'failure') throw new AiGenerationError('provider_unavailable');
    if (mode === 'reject') throw new AiGenerationError('content_rejected');
    return {
      text: 'A non-explicit fixture reply.',
      provider: 'deepseek' as const,
      model: 'test',
      responseId: randomUUID(),
      inputTokens: 1,
      outputTokens: 1,
    };
  });
  const headers = (actor = 0) => ({
    Authorization: `Bearer ${sessions[actor]!.token}`,
  });
  const post = (path: string, actor = 0) =>
    request(app!.getHttpServer()).post(path).set(headers(actor));
  const get = (path: string, actor = 0) =>
    request(app!.getHttpServer()).get(path).set(headers(actor));
  const timeline = async () =>
    timelinePageSchema.parse(
      (await get(`/v1/conversations/${conversation}/timeline`).expect(200))
        .body,
    );
  beforeAll(async () => {
    if (
      process.env.SUPABASE_URL !== guestDevelopmentUrl ||
      !process.env.SUPABASE_SECRET_KEY ||
      !process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
      throw new Error('Explicit anonymous development configuration required');
    app = await createApp();
    app.useLogger(['error', 'warn']);
    await app.init();
    const database = app.get(DatabaseService);
    await database.checkReadiness();
    admin = database.client;
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
    const inserted = await admin.from('companion_characters').insert({
      id: character,
      name: 'Level Integration Fixture',
      archetype: 'Development',
      bio: 'A temporary fictional adult fixture.',
      published: true,
    });
    if (inserted.error) throw new Error('Character fixture failed');
    const rules = await admin.rpc('companion_set_level_rules_v1', {
      p_character: character,
      p_rules: [
        { level: 1, requiredCount: 0 },
        { level: 2, requiredCount: 1 },
        { level: 3, requiredCount: 2 },
      ],
    });
    if (rules.error) throw new Error('Level configuration failed');
    let bucket = await admin.storage.getBucket(photoBucket);
    if (bucket.error) {
      const created = await admin.storage.createBucket(photoBucket, {
        public: false,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
        fileSizeLimit: 10485760,
      });
      if (created.error)
        throw new Error('Private development bucket unavailable');
      bucket = await admin.storage.getBucket(photoBucket);
    }
    if (bucket.error || bucket.data?.public !== false)
      throw new Error('Photo bucket must be private');
    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    for (const object of objects) {
      const upload = await admin.storage
        .from(photoBucket)
        .upload(object, image, { contentType: 'image/png', upsert: false });
      if (upload.error)
        throw new Error('Temporary private image upload failed');
    }
    const images = await admin.from('companion_photos').insert(
      photos.map((id, index) => ({
        id,
        character_id: character,
        title: `Level ${index + 1}`,
        required_level: index + 1,
        object_key: objects[index]!,
        review_status: 'approved' as const,
        published: true,
      })),
    );
    if (images.error) throw new Error('Photo fixtures failed');
    const ai = app.get(AiGateway);
    jest.spyOn(ai, 'assertConfigured').mockImplementation(() => undefined);
    jest.spyOn(ai, 'reply').mockImplementation(reply);
  });
  afterAll(async () => {
    fixtures.forEach((fixture) => fixture.dispose());
    let failed = false;
    if (admin) {
      if (identities.length)
        failed =
          !!(await admin.from('companion_users').delete().in('id', identities))
            .error || failed;
      failed =
        !!(await admin.from('companion_photos').delete().in('id', photos))
          .error || failed;
      failed =
        !!(
          await admin.from('companion_characters').delete().eq('id', character)
        ).error || failed;
      failed =
        !!(await admin.storage.from(photoBucket).remove(objects)).error ||
        failed;
      for (const id of identities)
        failed = !!(await admin.auth.admin.deleteUser(id)).error || failed;
    }
    await app?.close();
    if (failed) throw new Error('Level integration fixture cleanup failed');
  });
  it('opens at Level 1 and emits one initial photo card without counting a chat', async () => {
    conversation = (
      await post('/v1/conversations')
        .send({ characterId: character })
        .expect(201)
    ).body.id;
    await post('/v1/conversations')
      .send({ characterId: character })
      .expect(201);
    otherConversation = (
      await post('/v1/conversations', 1)
        .send({ characterId: character })
        .expect(201)
    ).body.id;
    const page = await timeline();
    expect(page.progress).toMatchObject({ level: 1, effectiveChatCount: 0 });
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]!.kind).toBe('photo');
  });
  it('commits one count and one level reward; replay and another visitor cannot duplicate or read them', async () => {
    const body = { requestKey: randomUUID(), text: 'Hello fixture' };
    const first = await post(`/v1/conversations/${conversation}/messages`)
      .send(body)
      .expect(201);
    const replay = await post(`/v1/conversations/${conversation}/messages`)
      .send(body)
      .expect(201);
    expect(first.body).toEqual(replay.body);
    expect(reply).toHaveBeenCalledTimes(1);
    const page = await timeline();
    expect(page.progress).toMatchObject({ level: 2, effectiveChatCount: 1 });
    expect(page.entries.filter((entry) => entry.kind === 'photo')).toHaveLength(
      2,
    );
    const bodyJson = JSON.stringify(page);
    expect(bodyJson).not.toContain('object_key');
    objects.forEach((key) => expect(bodyJson).not.toContain(key));
    await get(`/v1/conversations/${conversation}/timeline`, 1).expect(404);
    await post(
      `/v1/conversations/${conversation}/photos/${photos[1]}/access`,
      1,
    ).expect(404);
    await post(
      `/v1/conversations/${otherConversation}/photos/${photos[1]}/access`,
      1,
    ).expect(404);
    await post(
      `/v1/conversations/${conversation}/photos/${photos[2]}/access`,
    ).expect(404);
    const other = timelinePageSchema.parse(
      (
        await get(`/v1/conversations/${otherConversation}/timeline`, 1).expect(
          200,
        )
      ).body,
    );
    expect(other.progress.effectiveChatCount).toBe(0);
  });
  it('uses a private object and short-lived authorized image access', async () => {
    const response = await post(
      `/v1/conversations/${conversation}/photos/${photos[1]}/access`,
    ).expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const access = photoAccessSchema.parse(response.body);
    const signed = await fetch(access.url, {
      signal: AbortSignal.timeout(10000),
    });
    expect(signed.status).toBe(200);
    await signed.arrayBuffer();
    const publicUrl = admin!.storage.from(photoBucket).getPublicUrl(objects[1]!)
      .data.publicUrl;
    const publicResponse = await fetch(publicUrl, {
      signal: AbortSignal.timeout(10000),
    });
    expect(publicResponse.ok).toBe(false);
    await publicResponse.arrayBuffer();
  });
  it('does not count failures/rejections, counts a successful same-key retry once', async () => {
    const body = { requestKey: randomUUID(), text: 'Retry fixture' };
    mode = 'failure';
    await post(`/v1/conversations/${conversation}/messages`)
      .send(body)
      .expect(503);
    expect((await timeline()).progress.effectiveChatCount).toBe(1);
    mode = 'success';
    await post(`/v1/conversations/${conversation}/messages`)
      .send(body)
      .expect(201);
    await post(`/v1/conversations/${conversation}/messages`)
      .send(body)
      .expect(201);
    mode = 'reject';
    await post(`/v1/conversations/${conversation}/messages`)
      .send({ requestKey: randomUUID(), text: 'Rejected fixture' })
      .expect(422);
    mode = 'success';
    const page = await timeline();
    expect(page.progress).toMatchObject({ level: 3, effectiveChatCount: 2 });
    expect(page.entries.filter((entry) => entry.kind === 'photo')).toHaveLength(
      3,
    );
  });
  it('keeps acquired levels/photos after threshold changes, unpublishing and deleting history', async () => {
    const config = await admin!.rpc('companion_set_level_rules_v1', {
      p_character: character,
      p_rules: [
        { level: 1, requiredCount: 0 },
        { level: 2, requiredCount: 100 },
        { level: 3, requiredCount: 200 },
      ],
    });
    expect(config.error).toBeNull();
    expect((await timeline()).progress.level).toBe(3);
    const unpublished = await admin!
      .from('companion_photos')
      .update({ published: false })
      .eq('id', photos[0]!);
    expect(unpublished.error).toBeNull();
    const deleted = await admin!
      .from('companion_messages')
      .delete()
      .eq('conversation_id', conversation);
    expect(deleted.error).toBeNull();
    const gallery = levelGallerySchema.parse(
      (await get(`/v1/conversations/${conversation}/photos`).expect(200)).body,
    );
    expect(gallery.photos).toHaveLength(3);
    expect(gallery.photos.every((photo) => photo.unlocked)).toBe(true);
    await post(
      `/v1/conversations/${conversation}/photos/${photos[0]}/access`,
    ).expect(201);
    const page = await timeline();
    expect(page.progress.effectiveChatCount).toBe(2);
    expect(page.entries).toHaveLength(3);
    const cards = await admin!
      .from('companion_photo_messages')
      .delete()
      .eq('conversation_id', conversation);
    expect(cards.error).toBeNull();
    expect((await timeline()).entries).toHaveLength(0);
    expect((await timeline()).progress.level).toBe(3);
  });
});
