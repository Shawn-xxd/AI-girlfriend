import OpenAI from 'openai';
import {
  AiGenerationError,
  type GeneratedReply,
  type ProviderId,
  type UsageRecord,
} from './ai.types';
export function providerClient(
  key: string | undefined,
  baseURL: string,
  fetchImpl?: typeof fetch,
): OpenAI | undefined {
  return key
    ? new OpenAI({
        apiKey: key,
        baseURL,
        fetch: fetchImpl,
        timeout: 30000,
        maxRetries: 0,
        logLevel: 'off',
      })
    : undefined;
}
export function providerError(
  error: unknown,
  reply?: GeneratedReply,
): AiGenerationError {
  if (error instanceof AiGenerationError) return error;
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  const codes = {
    400: 'upstream_400',
    402: 'upstream_402',
    422: 'upstream_422',
    401: 'upstream_401',
    403: 'upstream_403',
    404: 'upstream_404',
    408: 'upstream_408',
    429: 'upstream_429',
  } as const;
  const safeCode =
    status && status >= 500
      ? 'upstream_5xx'
      : status && status in codes
        ? codes[status as keyof typeof codes]
        : 'transport';
  return new AiGenerationError('provider_unavailable', reply, safeCode);
}
export function usageRecord(
  provider: ProviderId,
  model: string,
  responseId: string | null,
  input: number | undefined,
  output: number | undefined,
): UsageRecord {
  if (
    typeof model !== 'string' ||
    !model ||
    model.length > 160 ||
    (responseId !== null &&
      (typeof responseId !== 'string' ||
        !responseId ||
        responseId.length > 256)) ||
    [input, output].some(
      (value) =>
        value !== undefined && (!Number.isSafeInteger(value) || value < 0),
    )
  ) {
    throw new AiGenerationError(
      'provider_unavailable',
      undefined,
      'invalid_completion',
    );
  }
  return {
    provider,
    model,
    responseId,
    inputTokens: input ?? null,
    outputTokens: output ?? null,
  };
}
