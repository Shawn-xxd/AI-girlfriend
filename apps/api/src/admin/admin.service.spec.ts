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
