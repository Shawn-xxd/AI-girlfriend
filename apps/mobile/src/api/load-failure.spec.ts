import { expect, it } from '@jest/globals';
import { describeCharacterLoadFailure } from './load-failure';
import { MobileApiError } from './core';
const ready = { status: 'ready' as const, error: null };
it('distinguishes identity recovery from profile and character failures', () => {
  expect(
    describeCharacterLoadFailure(
      {
        status: 'error',
        error: { code: 'session_lost', message: 'Saved identity lost' },
      },
      null,
      null,
    ).supportCode,
  ).toBe('IDENTITY_SESSION_LOST');
  expect(
    describeCharacterLoadFailure(
      ready,
      new MobileApiError('unauthorized'),
      null,
    ).supportCode,
  ).toBe('PROFILE_UNAUTHORIZED');
  expect(
    describeCharacterLoadFailure(
      ready,
      null,
      new MobileApiError('invalid_response'),
    ).supportCode,
  ).toBe('CHARACTERS_INVALID_RESPONSE');
});
it('never exposes arbitrary exception text, credentials, or response bodies', () => {
  const result = describeCharacterLoadFailure(
    ready,
    null,
    new Error('Bearer private-test-token backend detail'),
  );
  expect(JSON.stringify(result)).not.toContain('private-test-token');
  expect(result.supportCode).toBe('CHARACTERS_UNAVAILABLE');
});
