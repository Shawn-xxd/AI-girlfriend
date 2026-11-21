import type { z } from 'zod';
import { queryOptions, infiniteQueryOptions } from '@tanstack/react-query';
import type {
  CharacterList,
  ConversationDetail,
  ConversationSummary,
  CurrentUser,
  timelinePageSchema,
} from '@companion/shared';
import { MobileApiError } from './core';
import type { GuestSessionState } from '../auth/session-core';
type TimelinePage = z.infer<typeof timelinePageSchema>;
export const DATA_FRESH_MS = 30_000;
/** Cached data survives transient refresh failures, never an authorization failure. */
export function blockingLoadError(error: unknown, data: unknown): boolean {
  if (!error) return false;
  return (
    data === undefined ||
    !(error instanceof MobileApiError && error.code === 'unavailable')
  );
}
export function viewerOwner(
  guest: GuestSessionState,
  data: CurrentUser | undefined,
  error: unknown,
) {
  if (
    guest.status !== 'ready' ||
    !guest.owner ||
    data?.id !== guest.owner ||
    blockingLoadError(error, data)
  )
    return undefined;
  return guest.owner;
}
export function viewerQuery(
  owner: string | undefined,
  load: (signal: AbortSignal) => Promise<CurrentUser>,
) {
  return queryOptions({
    queryKey: ['mobile-api', owner ?? '', 'viewer'] as const,
    queryFn: async ({ signal }) => {
      const data = await load(signal);
      if (data.id !== owner) throw new MobileApiError('unauthorized');
      return data;
    },
    enabled: !!owner,
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
export function catalogQuery(
  owner: string | undefined,
  load: (owner: string, signal: AbortSignal) => Promise<CharacterList>,
) {
  return queryOptions({
    queryKey: ['mobile-api', owner, 'characters'] as const,
    queryFn: ({ signal }) => load(owner!, signal),
    enabled: !!owner,
    staleTime: DATA_FRESH_MS,
    refetchOnMount: true,
    retry: false,
  });
}
export function conversationsQuery(
  owner: string | undefined,
  load: (
    owner: string,
    signal: AbortSignal,
  ) => Promise<{ conversations: ConversationSummary[] }>,
) {
  return queryOptions({
    queryKey: ['mobile-api', owner, 'conversations'] as const,
    queryFn: ({ signal }) => load(owner!, signal),
    enabled: !!owner,
    staleTime: DATA_FRESH_MS,
    refetchOnMount: true,
    retry: false,
  });
}
export function detailQuery(
  owner: string,
  id: string,
  load: (
    owner: string,
    id: string,
    signal: AbortSignal,
  ) => Promise<ConversationDetail>,
) {
  return queryOptions({
    queryKey: ['mobile-api', owner, 'conversation', id] as const,
    queryFn: ({ signal }) => load(owner, id, signal),
    staleTime: DATA_FRESH_MS,
    retry: false,
  });
}
export function timelineQuery(
  owner: string,
  id: string,
  load: (
    owner: string,
    id: string,
    signal: AbortSignal,
    before?: number,
  ) => Promise<TimelinePage>,
) {
  return infiniteQueryOptions({
    queryKey: ['mobile-api', owner, 'timeline', id] as const,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ signal, pageParam }) => load(owner, id, signal, pageParam),
    getNextPageParam: (page) => page.nextBefore ?? undefined,
    staleTime: DATA_FRESH_MS,
    retry: false,
  });
}
