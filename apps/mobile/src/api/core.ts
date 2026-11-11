import { z } from 'zod';
export type ApiErrorCode =
  | 'configuration'
  | 'unavailable'
  | 'unauthorized'
  | 'not_found'
  | 'insufficient_diamonds'
  | 'wallet_conflict'
  | 'conflict'
  | 'rejected'
  | 'limited'
  | 'invalid_response';
const messages: Record<ApiErrorCode, string> = {
  insufficient_diamonds: 'Not enough diamonds.',
  wallet_conflict: 'Photo details changed. Please try again.',
  configuration: 'Unable to connect right now.',
  unavailable: 'Connection interrupted. Please try again.',
  unauthorized: 'Your connection needs to be restored. Please try again.',
  not_found: 'This conversation is no longer available.',
  conflict: 'A reply is still being prepared. Please try again shortly.',
  rejected: 'This message could not be sent. Try a different message.',
  limited: 'Please wait a moment before trying again.',
  invalid_response: 'Something went wrong. Please try again.',
};
export class MobileApiError extends Error {
  constructor(readonly code: ApiErrorCode) {
    super(messages[code]);
    this.name = 'MobileApiError';
  }
}
export function apiErrorForStatus(status: number): MobileApiError {
  return new MobileApiError(
    status === 401
      ? 'unauthorized'
      : status === 404
        ? 'not_found'
        : status === 409
          ? 'conflict'
          : status === 422
            ? 'rejected'
            : status === 429
              ? 'limited'
              : 'unavailable',
  );
}
export function apiBaseUrl(
  value: string | undefined,
  allowLocalHttp = false,
): string {
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    const ip = /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
      ? url.hostname.split('.').map(Number)
      : [];
    const local =
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      (ip.length === 4 &&
        (ip[0] === 10 ||
          (ip[0] === 192 && ip[1] === 168) ||
          (ip[0] === 172 && ip[1]! >= 16 && ip[1]! <= 31))) ||
      url.hostname.endsWith('.local');
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' &&
        !(allowLocalHttp && local && url.protocol === 'http:'))
    )
      throw new Error();
    return value.replace(/\/$/, '');
  } catch {
    throw new MobileApiError('configuration');
  }
}
export function createMobileApi(
  base: string | undefined,
  session: () => Promise<{ access_token: string; user: { id: string } }>,
  fetchImpl: typeof fetch = fetch,
  allowLocalHttp = false,
) {
  return async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: {
      method?: 'GET' | 'POST';
      body?: unknown;
      userId?: string;
      signal?: AbortSignal;
      timeoutMs?: number;
      walletRequest?: boolean;
    } = {},
  ): Promise<T> {
    try {
      const origin = apiBaseUrl(base, allowLocalHttp);
      if (!/^\/v1\//.test(path) || path.includes('..') || path.includes('://'))
        throw new MobileApiError('configuration');
      const identity = await session();
      if (options.userId && identity.user.id !== options.userId)
        throw new MobileApiError('unauthorized');
      const controller = new AbortController();
      const cancel = () => controller.abort();
      if (options.signal?.aborted) controller.abort();
      else options.signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(cancel, options.timeoutMs ?? 15000);
      try {
        const response = await fetchImpl(`${origin}${path}`, {
          method: options.method ?? 'GET',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${identity.access_token}`,
            Accept: 'application/json',
            ...(options.body === undefined
              ? {}
              : { 'Content-Type': 'application/json' }),
          },
          ...(options.body === undefined
            ? {}
            : { body: JSON.stringify(options.body) }),
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 402)
            throw new MobileApiError('insufficient_diamonds');
          if (response.status === 409 && options.walletRequest)
            throw new MobileApiError('wallet_conflict');
          throw apiErrorForStatus(response.status);
        }
        const parsed = schema.safeParse(await response.json());
        if (!parsed.success) throw new MobileApiError('invalid_response');
        return parsed.data;
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', cancel);
      }
    } catch (error) {
      if (error instanceof MobileApiError) throw error;
      throw new MobileApiError('unavailable');
    }
  };
}
