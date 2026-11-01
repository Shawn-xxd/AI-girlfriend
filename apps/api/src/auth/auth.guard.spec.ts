import { jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseAuthGuard } from './auth.guard';
import type { DatabaseService } from '../database.service';
const userId = '00000000-0000-4000-8000-000000000001';
function setup(header?: string) {
  const request = {
    headers: header ? { authorization: header } : {},
    authUserId: 'untrusted-client-id',
  };
  const getUser = jest.fn<() => Promise<unknown>>();
  const database = {
    client: { auth: { getUser } },
  } as unknown as DatabaseService;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { request, getUser, context, guard: new SupabaseAuthGuard(database) };
}
describe('Supabase authentication', () => {
  it('rejects missing or malformed authorization before an upstream call', async () => {
    for (const header of [undefined, 'Basic test', 'Bearer test extra']) {
      const test = setup(header);
      await expect(test.guard.canActivate(test.context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(test.getUser).not.toHaveBeenCalled();
    }
  });
  it('uses the verified identity, never a client-supplied ID', async () => {
    const test = setup('Bearer unit-test-token');
    test.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    expect(await test.guard.canActivate(test.context)).toBe(true);
    expect(test.request.authUserId).toBe(userId);
  });
  it('rejects expired or invalid sessions', async () => {
    const test = setup('Bearer unit-test-token');
    test.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 401 },
    });
    await expect(test.guard.canActivate(test.context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('distinguishes auth outages from an invalid session and hides errors', async () => {
    const test = setup('Bearer unit-test-token');
    test.getUser.mockRejectedValue(new Error('sensitive upstream error'));
    await expect(test.guard.canActivate(test.context)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
