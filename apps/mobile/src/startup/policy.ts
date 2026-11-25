import type { CharacterList, CurrentUser } from '@companion/shared';
import type { GuestSessionState } from '../auth/session-core';
import { blockingLoadError, viewerOwner } from '../api/loading-policy';
export const STARTUP_MAX_WAIT_MS = 6000;
type StartupState = {
  hydrated: boolean;
  completed: boolean;
  preview: boolean;
  destinationReady: boolean;
  guest: GuestSessionState;
  viewer?: CurrentUser;
  viewerError?: unknown;
  viewerFetching: boolean;
  catalog?: CharacterList;
  catalogError?: unknown;
  catalogFetching: boolean;
  coverReady: boolean;
  coverFailed?: boolean;
  expired: boolean;
};
export function startupPhase(
  input: StartupState,
): 'loading' | 'ready' | 'error' {
  if (!input.hydrated || !input.destinationReady)
    return input.expired ? 'error' : 'loading';
  // First-run onboarding and explicit design preview need no backend identity or catalog.
  if (!input.completed || input.preview) return 'ready';
  const viewerReady = !!viewerOwner(
    input.guest,
    input.viewer,
    input.viewerError,
  );
  const catalogBlocked = blockingLoadError(input.catalogError, input.catalog);
  if (viewerReady && input.catalog && !catalogBlocked && input.coverReady)
    return 'ready';
  if (
    input.expired ||
    input.coverFailed ||
    input.guest.status === 'error' ||
    (!input.viewerFetching &&
      blockingLoadError(input.viewerError, input.viewer)) ||
    (!input.catalogFetching && catalogBlocked)
  )
    return 'error';
  return 'loading';
}

/** Completed preparation milestones, not an estimate of remaining time or bytes. */
export function startupProgress(input: StartupState): number {
  if (startupPhase(input) === 'ready') return 1;
  if (!input.hydrated) return 0;
  if (!input.completed || input.preview) return 0.5;
  const identityReady = input.guest.status === 'ready';
  const viewerReady = !!viewerOwner(
    input.guest,
    input.viewer,
    input.viewerError,
  );
  const catalogReady =
    identityReady &&
    !!input.catalog &&
    !blockingLoadError(input.catalogError, input.catalog);
  return (
    [
      input.hydrated,
      identityReady,
      viewerReady,
      catalogReady,
      catalogReady && input.coverReady,
      input.destinationReady,
    ].filter(Boolean).length / 6
  );
}
