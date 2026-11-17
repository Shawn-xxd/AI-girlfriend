import 'reflect-metadata';
import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import request from 'supertest';
import { createApp } from '../src/app';
import { DatabaseService } from '../src/database.service';
import { createAuthFixture } from './auth-fixture';

jest.setTimeout(90000);
describe('real development admin Auth and Storage boundaries', () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let database: DatabaseService;
  const identities: string[] = [],
    objects: string[] = [];
  const sessions: Record<string, { id: string; token: string }> = {};
  const target = randomUUID();
  const url = 'https://dxpiqttvtxjhmlvxstbb.supabase.co';
  const fixture = {
    id: target,
    revision: null,
    name: 'Admin fixture',
    archetype: 'Test',
    bio: '',
    tags: [],
    system_prompt: 'Fictional adult',
    cover_object_key: null,
    published: false,
  };
  beforeAll(async () => {
    if (
      process.env.SUPABASE_URL !== url ||
      !process.env.SUPABASE_SECRET_KEY ||
      !process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
      throw new Error('Explicit development configuration required');
    app = await createApp();
    app.useLogger(['error', 'warn']);
    await app.init();
    database = app.get(DatabaseService);
    await database.checkReadiness();
    for (const role of ['ordinary', 'viewer', 'editor', 'admin']) {
      const session = await createAuthFixture(
        database.client,
        url,
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        (id) => identities.push(id),
      );
      if (role !== 'ordinary') {
        const r = await database.client.auth.admin.updateUserById(session.id, {
          app_metadata: { companion_admin_role: role },
        });
        if (r.error) throw new Error('Test role setup failed');
      }
      sessions[role] = session;
    }
  });
  afterAll(async () => {
    let failed = false;
    if (database) {
      if (objects.length) {
        const r = await database.client.storage
          .from('companion-photos')
          .remove(objects);
        failed ||= !!r.error;
      }
      for (const id of identities) {
        const r = await database.client.auth.admin.deleteUser(id);
        failed ||= !!r.error;
      }
    }
    await app?.close();
    if (failed) throw new Error('Admin test fixture cleanup failed');
  });
  const auth = (role: string) => ({
    Authorization: `Bearer ${sessions[role]!.token}`,
  });
  it('rejects missing and ordinary identities and reads server-owned roles live', async () => {
    await request(app!.getHttpServer()).get('/v1/admin/me').expect(401);
    await request(app!.getHttpServer())
      .get('/v1/admin/me')
      .set(auth('ordinary'))
      .expect(403);
    await request(app!.getHttpServer())
      .get('/v1/admin/me')
      .set(auth('admin'))
      .expect(200, { id: sessions.admin!.id, role: 'admin' });
  });
  it('blocks viewer writes and editor publication without creating business data', async () => {
    await request(app!.getHttpServer())
      .post('/v1/admin/characters')
      .set(auth('viewer'))
      .send(fixture)
      .expect(403);
    await request(app!.getHttpServer())
      .post('/v1/admin/characters')
      .set(auth('editor'))
      .send({ ...fixture, published: true })
      .expect(403);
    const r = await database.client
      .from('companion_characters')
      .select('id')
      .eq('id', target);
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
  });
  it('reads real content and audit through the administrator API', async () => {
    for (const path of ['characters', 'audit']) {
      const r = await request(app!.getHttpServer())
        .get(`/v1/admin/${path}`)
        .set(auth('admin'))
        .expect(200);
      expect(Array.isArray(r.body.items)).toBe(true);
    }
  });
  it('restricts user management to admins and returns current product records without mutation', async () => {
    for (const role of ['ordinary', 'viewer', 'editor']) {
      await request(app!.getHttpServer())
        .get('/v1/admin/users')
        .set(auth(role))
        .expect(403);
    }
    await request(app!.getHttpServer()).get('/v1/admin/users').expect(401);
    await request(app!.getHttpServer())
      .get('/v1/admin/users?before=invalid')
      .set(auth('admin'))
      .expect(400);
    const response = await request(app!.getHttpServer())
      .get('/v1/admin/users')
      .set(auth('admin'))
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const expected = await database.client
      .from('companion_users')
      .select('id,created_at')
      .order('id', { ascending: false })
      .limit(50);
    expect(expected.error).toBeNull();
    expect(response.body.items.map((user: { id: string }) => user.id)).toEqual(
      expected.data!.map((user) => user.id),
    );
    for (const user of response.body.items) {
      const wallet = await database.client
        .from('companion_wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();
      expect(wallet.error).toBeNull();
      expect(user.availableDiamonds).toBe(
        Math.max(0, wallet.data?.balance ?? 0),
      );
      expect(user.firstSeenAt).toBe(
        expected.data!.find((row) => row.id === user.id)!.created_at,
      );
    }
    const search = await request(app!.getHttpServer())
      .get('/v1/admin/characters?search=Mei')
      .set(auth('admin'))
      .expect(200);
    expect(
      search.body.items.every((character: { name: string }) =>
        character.name.toLowerCase().includes('mei'),
      ),
    ).toBe(true);
    const literal = await request(app!.getHttpServer())
      .get('/v1/admin/characters?search=%25')
      .set(auth('admin'))
      .expect(200);
    expect(
      literal.body.items.every((character: { name: string }) =>
        character.name.includes('%'),
      ),
    ).toBe(true);
  });
  it('reads one global config, rejects character targets and restricts writes to admins', async () => {
    const current = await request(app!.getHttpServer())
      .get('/v1/admin/global-levels')
      .set(auth('admin'))
      .expect(200);
    expect(current.body.rules[0]).toEqual({ level: 1, requiredCount: 0 });
    expect(current.body).not.toHaveProperty('character_id');
    for (const role of ['viewer', 'editor']) {
      await request(app!.getHttpServer())
        .post('/v1/admin/global-levels')
        .set(auth(role))
        .send(current.body)
        .expect(403);
    }
    await request(app!.getHttpServer())
      .get('/v1/admin/global-levels')
      .set(auth('ordinary'))
      .expect(403);
    await request(app!.getHttpServer())
      .post('/v1/admin/global-levels')
      .set(auth('admin'))
      .send({ ...current.body, character_id: target })
      .expect(400);
    await request(app!.getHttpServer())
      .post('/v1/admin/global-levels')
      .set(auth('admin'))
      .send({ ...current.body, revision: current.body.revision + 1 })
      .expect(409);
    const after = await request(app!.getHttpServer())
      .get('/v1/admin/global-levels')
      .set(auth('admin'))
      .expect(200);
    expect(after.body).toEqual(current.body);
    await request(app!.getHttpServer())
      .get(`/v1/admin/levels?characterId=${target}`)
      .set(auth('admin'))
      .expect(404);
  });
  it('validates uploaded PNG bytes before refusing an unknown photo character, without audit writes', async () => {
    const pub = createClient(
      url,
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    for (const valid of [true, false]) {
      const grant = await request(app!.getHttpServer())
        .post('/v1/admin/uploads')
        .set(auth('admin'))
        .send({ contentType: 'image/png' })
        .expect(201);
      const path = grant.body.path as string;
      objects.push(path);
      const bytes = valid
        ? Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlV8AAAAASUVORK5CYII=',
            'base64',
          )
        : Buffer.from('<html>not an image</html>');
      const uploaded = await pub.storage
        .from('companion-photos')
        .uploadToSignedUrl(path, grant.body.token, bytes, {
          contentType: 'image/png',
        });
      expect(uploaded.error).toBeNull();
      await request(app!.getHttpServer())
        .post('/v1/admin/photos')
        .set(auth('admin'))
        .send({
          id: randomUUID(),
          revision: null,
          character_id: target,
          title: 'Temporary upload',
          kind: 'level',
          required_level: 1,
          diamond_price: null,
          object_key: path,
          review_status: 'draft',
          published: false,
        })
        .expect((res) => {
          if (res.status !== (valid ? 404 : 400))
            throw new Error(
              JSON.stringify({ status: res.status, message: res.body.message }),
            );
        });
    }
    const audit = await database.client
      .from('companion_admin_audit')
      .select('id')
      .eq('actor_id', sessions.admin!.id);
    expect(audit.error).toBeNull();
    expect(audit.data).toEqual([]);
  });
});
