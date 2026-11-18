import type { GuestSessionState } from '../auth/session-core';
import { MobileApiError } from './core';

export function describeCharacterLoadFailure(
  guest: GuestSessionState,
  profileError: unknown,
  charactersError: unknown,
) {
  if (guest.status === 'error') {
    const lost = guest.error?.code === 'session_lost';
    return {
      message: lost
        ? 'Your saved connection needs to be restored. Please try again.'
        : 'Unable to restore your connection. Please try again.',
      supportCode: lost ? 'IDENTITY_SESSION_LOST' : 'IDENTITY_UNAVAILABLE',
    };
  }
  const profile = profileError !== null && profileError !== undefined;
  const error = profile ? profileError : charactersError;
  const code = error instanceof MobileApiError ? error.code : 'unavailable';
  return {
    message:
      code === 'configuration'
        ? 'App connection settings are unavailable.'
        : code === 'unauthorized'
          ? 'Your connection needs to be restored. Please try again.'
          : code === 'invalid_response'
            ? 'Unable to read companion data. Please try again.'
            : 'Unable to reach the service. Please try again.',
    supportCode: `${profile ? 'PROFILE' : 'CHARACTERS'}_${code.toUpperCase()}`,
  };
}
