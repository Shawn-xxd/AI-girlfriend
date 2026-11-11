import 'reflect-metadata';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  gallerySchema,
  photoUnlockResponseSchema,
  walletSchema,
} from '@companion/shared';
import { createApp } from '../src/app';
import { DatabaseService } from '../src/database.service';
import { guestDevelopmentUrl, guestFixture } from './guest-session-fixture';
config({ quiet: true });
describe('real development Supabase wallet and permanent Diamond Photos (no payment provider)', () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let admin: DatabaseService['client'] | undefined;
  const identities: string[] = [],
    fixtures: ReturnType<typeof guestFixture>[] = [];
  const sessions: { id: string; token: string }[] = [];
  const character = randomUUID(),
    photos = [randomUUID(), randomUUID()],
    key = randomUUID();
  const object = `${character}/${photos[0]}.png`;
  let conversation: string, credit: string;
  const headers = (index = 0) => ({
    Authorization: `Bearer ${sessions[index]!.token}`,
  });
  const get = (path: string, index = 0) =>
    request(app!.getHttpServer()).get(path).set(headers(index));
  const post = (path: string, index = 0) =>
    request(app!.getHttpServer()).post(path).set(headers(index));
  const unlock = (
    photo: string,
    requestKey: string,
    expectedPrice = 7,
    actor = 0,
  ) =>
    post(
      `/v1/conversations/${conversation}/photos/${photo}/unlock`,
      actor,
    ).send({ requestKey, expectedPrice });
  beforeAll(async () => {
    if (
      process.env.SUPABASE_URL !== guestDevelopmentUrl ||
      !process.env.SUPABASE_SECRET_KEY ||
      !process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
      throw new Error('Explicit development credentials required');
    app = await createApp();
    app.useLogger(['error', 'warn']);
    await app.init();
    const database = app.get(DatabaseService);
    // Check before creating any identity or fixture. Never treat a missing migration as success.
    await database.checkReadiness();
    admin = database.client;
    for (let i = 0; i < 2; i++) {
      const fixture = guestFixture(
        guestDevelopmentUrl,
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        (id) => identities.push(id),
      );
      fixtures.push(fixture);
      const session = await fixture.restart().ensureSession();
      sessions.push({ id: session.user.id, token: session.access_token });
      await get('/v1/me', i).expect(200);
    }
    const inserted = await admin.from('companion_characters').insert({
      id: character,
      name: 'Wallet integration fixture',
      archetype: 'Development',
      bio: 'Temporary fictional adult fixture.',
      published: true,
    });
    if (inserted.error) throw new Error('Character fixture failed');
    conversation = (
      await post('/v1/conversations')
        .send({ characterId: character })
        .expect(201)
    ).body.id;
    const uploaded = await admin.storage
      .from('companion-photos')
      .upload(
        object,
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
        { contentType: 'image/png' },
      );
    if (uploaded.error) throw new Error('Private photo fixture failed');
    const photoRows = await admin.from('companion_photos').insert(
      photos.map((id, i) => ({
        id,
        character_id: character,
        kind: 'diamond' as const,
        title: `Diamond fixture ${i + 1}`,
        object_key: i === 0 ? object : `${character}/${id}.png`,
        review_status: 'approved' as const,
        published: true,
        diamond_price: 7,
      })),
    );
    if (photoRows.error) throw new Error('Photo fixture failed');
  });
  afterAll(async () => {
    const errors: string[] = [];
    if (admin) {
      for (const id of identities) {
        const removals = [
          await admin
            .from('companion_user_character_progress')
            .delete()
            .eq('user_id', id),
          await admin.from('companion_wallets').delete().eq('user_id', id),
          await admin.from('companion_users').delete().eq('id', id),
        ];
        for (const result of removals)
          if (result.error) errors.push('Fixture business data cleanup failed');
        const result = await admin.auth.admin.deleteUser(id);
        if (result.error) errors.push('Fixture identity cleanup failed');
      }
      const objects = await admin.storage
        .from('companion-photos')
        .remove([object]);
      if (objects.error) errors.push('Fixture storage cleanup failed');
      const result = await admin
        .from('companion_characters')
        .delete()
        .eq('id', character);
      if (result.error) errors.push('Fixture character cleanup failed');
    }
    fixtures.forEach((f) => f.dispose());
    await app?.close();
    if (errors.length) throw new Error(errors.join('; '));
  });
  it('requires JWT and starts with a verified zero; locked originals are inaccessible', async () => {
    await request(app!.getHttpServer()).get('/v1/wallet').expect(401);
    expect(
      walletSchema.parse((await get('/v1/wallet').expect(200)).body),
    ).toEqual({ availableDiamonds: 0, pendingRecovery: 0 });
    await post(
      `/v1/conversations/${conversation}/photos/${photos[0]}/access`,
    ).expect(404);
    await unlock(photos[0]!, key).expect(402);
  });
  it('rejects owner spoofing, another actor, and an unseen price without spending', async () => {
    const credited = await admin!.rpc('companion_credit_wallet_v1', {
      p_actor: sessions[0]!.id,
      p_amount: 14,
      p_reference: `fixture/${character}`,
    });
    if (credited.error) throw new Error('Fixture credit failed');
    credit = credited.data;
    await unlock(photos[0]!, key, 7, 1).expect(404);
    await post(`/v1/conversations/${conversation}/photos/${photos[0]}/unlock`)
      .send({ requestKey: key, expectedPrice: 7, actor: sessions[1]!.id })
      .expect(400);
    await unlock(photos[0]!, key, 8).expect(409);
    expect((await get('/v1/wallet')).body.availableDiamonds).toBe(14);
  });
  it('commits one debit under concurrent duplicate requests and persists the entitlement', async () => {
    const results = await Promise.all([
      unlock(photos[0]!, key).expect(201),
      unlock(photos[0]!, key).expect(201),
    ]);
    for (const result of results)
      expect(
        photoUnlockResponseSchema.parse(result.body).wallet.availableDiamonds,
      ).toBe(7);
    const owned = await unlock(photos[0]!, randomUUID()).expect(201);
    expect(owned.body.chargedDiamonds).toBe(0);
    await unlock(photos[1]!, key).expect(409);
    const gallery = gallerySchema.parse(
      (await get(`/v1/conversations/${conversation}/gallery`).expect(200)).body,
    );
    expect(gallery.photos.find((p) => p.id === photos[0])?.unlocked).toBe(true);
    expect(
      (
        await admin!
          .from('companion_wallet_transactions')
          .select('id')
          .eq('user_id', sessions[0]!.id)
          .eq('kind', 'spend')
      ).data,
    ).toHaveLength(1);
  });
  it('reclaims the whole credit, preserves photos, and uses later credits to settle recovery first', async () => {
    const refund = await admin!.rpc('companion_reverse_credit_v1', {
      p_credit: credit,
      p_reference: `fixture/${character}/refund`,
    });
    if (refund.error) throw new Error('Fixture refund failed');
    const repeat = await admin!.rpc('companion_reverse_credit_v1', {
      p_credit: credit,
      p_reference: `fixture/${character}/refund`,
    });
    expect(repeat.error).toBeNull();
    expect(repeat.data).toBe(refund.data);
    expect((await get('/v1/wallet').expect(200)).body).toEqual({
      availableDiamonds: 0,
      pendingRecovery: 7,
    });
    await unlock(photos[1]!, randomUUID()).expect(402);
    const access = await post(
      `/v1/conversations/${conversation}/photos/${photos[0]}/access`,
    ).expect(201);
    expect(new URL(access.body.url).pathname).toContain(
      '/storage/v1/object/sign/companion-photos/',
    );
    expect((await fetch(access.body.url)).ok).toBe(true);
    const credited = await admin!.rpc('companion_credit_wallet_v1', {
      p_actor: sessions[0]!.id,
      p_amount: 10,
      p_reference: `fixture/${character}/recovery`,
    });
    if (credited.error) throw new Error('Fixture recovery failed');
    expect(
      walletSchema.parse((await get('/v1/wallet').expect(200)).body),
    ).toEqual({ availableDiamonds: 3, pendingRecovery: 0 });
  });
});
