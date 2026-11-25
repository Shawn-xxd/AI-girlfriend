import { expect, it } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';
import { startupPhase, startupProgress } from './policy';
import { catalogQuery, viewerQuery } from '../api/loading-policy';
import { MobileApiError } from '../api/core';
const owner = '11111111-1111-4111-8111-111111111111';
const viewer = { id: owner, createdAt: '2026-11-24T00:00:00.000Z' };
const ready = {
  hydrated: true,
  completed: true,
  preview: false,
  destinationReady: true,
  guest: { status: 'ready' as const, owner, error: null },
  viewer,
  viewerFetching: false,
  catalogFetching: false,
  catalog: { characters: [] },
  coverReady: true,
  expired: false,
};
it('releases first-run onboarding and explicit preview without waiting for backend access', () => {
  expect(
    startupPhase({
      ...ready,
      completed: false,
      guest: { status: 'idle', error: null },
      viewer: undefined,
      catalog: undefined,
      coverReady: false,
    }),
  ).toBe('ready');
  expect(
    startupPhase({
      ...ready,
      preview: true,
      guest: { status: 'idle', error: null },
      viewer: undefined,
      catalog: undefined,
    }),
  ).toBe('ready');
});
it('waits for restored preferences, the destination screen and the first cover', () => {
  expect(startupPhase({ ...ready, hydrated: false })).toBe('loading');
  expect(startupPhase({ ...ready, destinationReady: false })).toBe('loading');
  expect(startupPhase({ ...ready, coverReady: false })).toBe('loading');
  expect(startupPhase({ ...ready, viewer: undefined })).toBe('loading');
  expect(startupPhase({ ...ready, catalog: undefined })).toBe('loading');
  expect(startupPhase(ready)).toBe('ready');
});
it('does not accept a cached viewer belonging to another identity or a known authorization failure', () => {
  expect(
    startupPhase({
      ...ready,
      viewer: { ...viewer, id: '22222222-2222-4222-8222-222222222222' },
    }),
  ).toBe('loading');
  for (const code of [
    'unauthorized',
    'invalid_response',
    'configuration',
  ] as const) {
    expect(
      startupPhase({ ...ready, viewerError: new MobileApiError(code) }),
    ).toBe('error');
    expect(
      startupPhase({ ...ready, catalogError: new MobileApiError(code) }),
    ).toBe('error');
  }
  expect(
    startupPhase({ ...ready, guest: { status: 'loading', error: null } }),
  ).toBe('loading');
});
it('uses same-owner cached data during a temporary refresh failure instead of adding a fixed wait', () => {
  expect(
    startupPhase({
      ...ready,
      viewerError: new MobileApiError('unavailable'),
      catalogError: new MobileApiError('unavailable'),
      viewerFetching: true,
      catalogFetching: true,
    }),
  ).toBe('ready');
});
it('shows an error/retry view on failed assets or a startup deadline', () => {
  expect(startupPhase({ ...ready, coverReady: false, coverFailed: true })).toBe(
    'error',
  );
  expect(startupPhase({ ...ready, coverReady: false, expired: true })).toBe(
    'error',
  );
  expect(startupPhase({ ...ready, hydrated: false, expired: true })).toBe(
    'error',
  );
  expect(
    startupPhase({
      ...ready,
      guest: {
        status: 'error',
        error: { code: 'unavailable', message: 'Unavailable' },
      },
    }),
  ).toBe('error');
  expect(startupPhase({ ...ready, expired: true })).toBe('ready');
});
it('advances progress for completed parallel tasks without treating an absent cover URL as a loaded catalog', () => {
  expect(startupProgress({ ...ready, hydrated: false })).toBe(0);
  const catalogPending = {
    ...ready,
    viewer: undefined,
    catalog: undefined,
    coverReady: true,
  };
  const initial = startupProgress(catalogPending);
  const viewerFirst = startupProgress({ ...catalogPending, viewer });
  const catalogFirst = startupProgress({
    ...catalogPending,
    catalog: ready.catalog,
  });
  expect(viewerFirst).toBeGreaterThan(initial);
  expect(catalogFirst).toBeGreaterThan(initial);
  expect(viewerFirst).toBeLessThan(1);
  expect(catalogFirst).toBeLessThan(1);
  expect(startupProgress({ ...ready, coverReady: false })).toBeLessThan(1);
  expect(startupProgress({ ...ready, destinationReady: false })).toBeLessThan(
    1,
  );
  expect(startupProgress(ready)).toBe(1);
});
it('does not show completion for an invalid identity, failed asset or retry, and does not delay onboarding', () => {
  for (const state of [
    {
      ...ready,
      viewer: { ...viewer, id: '22222222-2222-4222-8222-222222222222' },
    },
    { ...ready, coverReady: false, coverFailed: true },
    {
      ...ready,
      viewerError: new MobileApiError('unauthorized'),
      viewerFetching: true,
    },
  ])
    expect(startupProgress(state)).toBeLessThan(1);
  expect(
    startupProgress({
      ...ready,
      completed: false,
      viewer: undefined,
      catalog: undefined,
    }),
  ).toBe(1);
  expect(
    startupProgress({
      ...ready,
      preview: true,
      viewer: undefined,
      catalog: undefined,
    }),
  ).toBe(1);
});
it('allows explicit retry to wait for a response without treating stale errors as success', () => {
  expect(
    startupPhase({
      ...ready,
      viewerError: new MobileApiError('unauthorized'),
      viewerFetching: true,
    }),
  ).toBe('loading');
  expect(
    startupPhase({
      ...ready,
      catalogError: new MobileApiError('unavailable'),
      catalog: undefined,
      catalogFetching: true,
    }),
  ).toBe('loading');
});
it('shares pending first-screen requests with screen queries and reuses fresh results', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let viewerCalls = 0,
    catalogCalls = 0;
  let sendViewer!: (value: typeof viewer) => void;
  let sendCatalog!: (value: { characters: [] }) => void;
  const v = viewerQuery(owner, () => {
    viewerCalls++;
    return new Promise((resolve) => {
      sendViewer = resolve;
    });
  });
  const c = catalogQuery(owner, () => {
    catalogCalls++;
    return new Promise((resolve) => {
      sendCatalog = resolve;
    });
  });
  const startup = [client.fetchQuery(v), client.fetchQuery(c)];
  const screen = [client.fetchQuery(v), client.fetchQuery(c)];
  expect(viewerCalls).toBe(1);
  expect(catalogCalls).toBe(1);
  sendViewer(viewer);
  sendCatalog({ characters: [] });
  await Promise.all([...startup, ...screen]);
  await Promise.all([client.fetchQuery(v), client.fetchQuery(c)]);
  expect(viewerCalls).toBe(1);
  expect(catalogCalls).toBe(1);
  client.clear();
});
