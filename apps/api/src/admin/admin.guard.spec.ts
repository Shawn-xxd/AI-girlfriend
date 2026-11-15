import { jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import type { DatabaseService } from '../database.service';
import {
  AdminGuard,
  requireEditor,
  requirePublisher,
  type AdminRequest,
} from './admin.guard';
function setup(user: unknown, error: unknown = null) {
  const request = {
    headers: { authorization: 'Bearer test-token' },
  } as unknown as AdminRequest;
  const getUser = jest.fn(async () => ({ data: { user }, error }));
  const guard = new AdminGuard({
    client: { auth: { getUser } },
  } as unknown as DatabaseService);
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { guard, context, request, getUser };
}
const user = {
  id: 'admin',
  is_anonymous: false,
  email_confirmed_at: '2026-01-01',
  app_metadata: { companion_admin_role: 'admin' },
};
it('requires a bearer token before contacting Auth', async () => {
  const f = setup(user);
  f.request.headers = {};
  await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
    status: 401,
  });
  expect(f.getUser).not.toHaveBeenCalled();
});
it.each([
  { ...user, is_anonymous: true },
  { ...user, email_confirmed_at: null },
  {
    ...user,
    app_metadata: {},
    user_metadata: { companion_admin_role: 'admin' },
  },
])('rejects anonymous, unconfirmed and user-editable roles', async (u) => {
  const f = setup(u);
  await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
    status: 403,
  });
});
it('uses live server-owned metadata and attaches the verified actor', async () => {
  const f = setup(user);
  await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
  expect(f.request.admin).toEqual({ id: 'admin', role: 'admin' });
});
it('distinguishes Auth outages from bad credentials', async () => {
  const f = setup(null, { status: 503 });
  await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
    status: 503,
  });
});
it('restricts mutations and publishing independently', () => {
  expect(() => requireEditor({ id: 'x', role: 'viewer' })).toThrow();
  expect(() => requireEditor({ id: 'x', role: 'editor' })).not.toThrow();
  expect(() => requirePublisher({ id: 'x', role: 'editor' })).toThrow();
});
