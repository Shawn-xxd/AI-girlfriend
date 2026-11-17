import { jest } from '@jest/globals';
import { AdminService } from './admin.service';
import type { DatabaseService } from '../database.service';
import type { AdminCharacterInput } from '@companion/shared';
const input: AdminCharacterInput = {
  id: '10000000-0000-4000-8000-000000000001',
  revision: 4,
  name: 'Test',
  archetype: 'Test',
  bio: '',
  tags: [],
  system_prompt: 'Adult fictional character',
  cover_object_key: null,
  published: false,
};
function setup(error: { code: string } | null = null) {
  const rpc = jest.fn(async () => ({ data: { ...input, revision: 5 }, error }));
  return {
    rpc,
    service: new AdminService({
      client: { rpc },
    } as unknown as DatabaseService),
  };
}
it('uses one atomic RPC for content and its audit with the verified actor', async () => {
  const f = setup();
  await f.service.saveCharacter(
    { id: 'verified-admin', role: 'editor' },
    input,
  );
  expect(f.rpc).toHaveBeenCalledWith(
    'companion_admin_write_v1',
    expect.objectContaining({
      p_actor: 'verified-admin',
      p_role: 'editor',
      p_revision: 4,
      p_target: input.id,
    }),
  );
});
it('rejects publication by editors before database writes', async () => {
  const f = setup();
  await expect(
    f.service.saveCharacter(
      { id: 'editor', role: 'editor' },
      { ...input, published: true },
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(f.rpc).not.toHaveBeenCalled();
});
it('rejects stale versions rather than overwriting concurrent edits', async () => {
  const f = setup({ code: 'PT409' });
  await expect(
    f.service.saveCharacter({ id: 'admin', role: 'admin' }, input),
  ).rejects.toMatchObject({ status: 409 });
});
it('does not expose database error details', async () => {
  const f = setup({ code: 'INTERNAL_DETAIL' });
  await expect(
    f.service.saveCharacter({ id: 'admin', role: 'admin' }, input),
  ).rejects.toMatchObject({ status: 503 });
});
it('lists product users with available diamonds, including users without wallets', async () => {
  const users = Array.from({ length: 51 }, (_, i) => ({
    id: `user-${i}`,
    created_at: '2026-11-01T00:00:00Z',
  }));
  const scope = jest.fn();
  const from = (table: string) => {
    const chain = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      lt: async () => ({ data: users, error: null }),
      in: async (column: string, ids: string[]) => {
        scope(column, ids);
        return {
          data: [
            { user_id: 'user-0', balance: 25 },
            { user_id: 'user-1', balance: -5 },
          ],
          error: null,
        };
      },
    };
    expect(['companion_users', 'companion_wallets']).toContain(table);
    return chain;
  };
  const service = new AdminService({
    client: { from },
  } as unknown as DatabaseService);
  const result = await service.users();
  expect(result.items).toHaveLength(50);
  expect(result.nextCursor).toBe('user-49');
  expect(result.items[0]).toEqual({
    id: 'user-0',
    firstSeenAt: users[0]!.created_at,
    availableDiamonds: 25,
  });
  expect(result.items[1]!.availableDiamonds).toBe(0);
  expect(result.items[2]!.availableDiamonds).toBe(0);
  expect(scope).toHaveBeenCalledWith(
    'user_id',
    users.slice(0, 50).map((user) => user.id),
  );
});
it('saves one global config with admin identity and revision, without a character target', async () => {
  const rpc = jest.fn(async () => ({ data: { revision: 2 }, error: null }));
  const service = new AdminService({
    client: { rpc },
  } as unknown as DatabaseService);
  const input = { revision: 1, rules: [{ level: 1, requiredCount: 0 }] };
  await expect(
    service.saveGlobalLevels({ id: 'editor', role: 'editor' }, input),
  ).rejects.toMatchObject({ status: 403 });
  expect(rpc).not.toHaveBeenCalled();
  await service.saveGlobalLevels({ id: 'admin', role: 'admin' }, input);
  expect(rpc).toHaveBeenCalledWith('companion_admin_save_global_levels_v1', {
    p_actor: 'admin',
    p_role: 'admin',
    p_revision: 1,
    p_rules: input.rules,
  });
});
