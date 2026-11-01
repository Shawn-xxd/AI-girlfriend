import { describe, expect, it, jest } from '@jest/globals';
import {
  createChunkedAuthStorage,
  createGuestIdentityStorage,
  type AuthStorage,
} from './storage-core';

function setup() {
  const items = new Map<string, string>();
  const storage: AuthStorage = {
    getItem: jest.fn(async (key: string) => items.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      if (new TextEncoder().encode(value).byteLength > 2048)
        throw new Error('SecureStore size limit');
      items.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      items.delete(key);
    }),
  };
  return { items, storage, auth: createChunkedAuthStorage(storage) };
}

describe('native guest session persistence', () => {
  it('round-trips long Unicode sessions within SecureStore byte limits', async () => {
    const { auth, items } = setup();
    const value = JSON.stringify({
      token: 'a'.repeat(9000),
      name: '好🌙'.repeat(900),
    });
    await auth.setItem('test-auth', value);
    expect(items.size).toBeGreaterThan(2);
    await expect(auth.getItem('test-auth')).resolves.toBe(value);
    await auth.removeItem('test-auth');
    await expect(auth.getItem('test-auth')).resolves.toBeNull();
    expect(items.size).toBe(0);
  });

  it('retains the previous complete session when committing a replacement fails', async () => {
    const { auth, storage, items } = setup();
    await auth.setItem('test-auth', 'old-session');
    const write = jest.mocked(storage.setItem).getMockImplementation()!;
    jest.mocked(storage.setItem).mockImplementation(async (key, value) => {
      if (key === 'companion.guest.test-auth') throw new Error('write failed');
      await write(key, value);
    });
    await expect(auth.setItem('test-auth', 'next-session')).rejects.toThrow();
    await expect(auth.getItem('test-auth')).resolves.toBe('old-session');
    expect(items.size).toBe(2);
  });

  it('serializes writes and removal so a pending write cannot resurrect logout', async () => {
    const { auth, items } = setup();
    const write = auth.setItem('test-auth', 'session'.repeat(1000));
    const remove = auth.removeItem('test-auth');
    await Promise.all([write, remove]);
    await expect(auth.getItem('test-auth')).resolves.toBeNull();
    expect(items.size).toBe(0);
  });

  it('fails closed on incomplete storage instead of returning a partial session', async () => {
    const { auth, items } = setup();
    await auth.setItem('test-auth', 'session');
    const chunk = [...items.keys()].find((key) => key.endsWith('.0'));
    if (!chunk) throw new Error('Expected a session chunk');
    items.delete(chunk);
    await expect(auth.getItem('test-auth')).rejects.toThrow(
      'Session storage unavailable',
    );
  });
});

describe('persistent guest identity marker', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  it('migrates a saved guest and keeps its marker after SDK session deletion', async () => {
    const { auth } = setup();
    await auth.setItem('test-auth', JSON.stringify({ user: { id: userId } }));
    const identities = createGuestIdentityStorage(auth, 'test-auth');
    await expect(identities.getIdentity()).resolves.toBe(userId);
    await auth.removeItem('test-auth');
    const restarted = createGuestIdentityStorage(auth, 'test-auth');
    await expect(restarted.getIdentity()).resolves.toBe(userId);
    await expect(auth.getItem('test-auth')).resolves.toBeNull();
  });

  it('fails closed on corrupt markers and never overwrites them', async () => {
    for (const marker of [
      'corrupt',
      'null',
      JSON.stringify({ version: 2, userId }),
      JSON.stringify({ version: 1, userId: 'invalid' }),
    ]) {
      const { auth } = setup();
      await auth.setItem('test-auth-identity', marker);
      const identities = createGuestIdentityStorage(auth, 'test-auth');
      await expect(identities.getIdentity()).rejects.toThrow();
      await expect(identities.rememberIdentity(userId)).rejects.toThrow();
      await expect(auth.getItem('test-auth-identity')).resolves.toBe(marker);
    }
  });

  it('does not replace an existing identity marker with another guest', async () => {
    const { auth } = setup();
    const identities = createGuestIdentityStorage(auth, 'test-auth');
    await identities.rememberIdentity(userId);
    await expect(
      identities.rememberIdentity('22222222-2222-4222-8222-222222222222'),
    ).rejects.toThrow();
    await expect(identities.getIdentity()).resolves.toBe(userId);
  });

  it('does not treat an unreadable existing session as a first installation', async () => {
    const { auth } = setup();
    await auth.setItem('test-auth', '{broken-session');
    const identities = createGuestIdentityStorage(auth, 'test-auth');
    await expect(identities.getIdentity()).rejects.toThrow();
    await expect(auth.getItem('test-auth-identity')).resolves.toBeNull();
  });

  it('preserves the old session when persisting its identity marker fails', async () => {
    const { auth, storage } = setup();
    const session = JSON.stringify({ user: { id: userId } });
    await auth.setItem('test-auth', session);
    const write = jest.mocked(storage.setItem).getMockImplementation()!;
    jest.mocked(storage.setItem).mockImplementation(async (key, value) => {
      if (key === 'companion.guest.test-auth-identity')
        throw new Error('write failed');
      await write(key, value);
    });
    const identities = createGuestIdentityStorage(auth, 'test-auth');
    await expect(identities.getIdentity()).rejects.toThrow();
    await expect(auth.getItem('test-auth')).resolves.toBe(session);
    await expect(auth.getItem('test-auth-identity')).resolves.toBeNull();
  });
});
