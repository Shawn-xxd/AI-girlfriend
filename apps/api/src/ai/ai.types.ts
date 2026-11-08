export const AI_CONFIG = Symbol('AI_CONFIG');
export const AI_HTTP_FETCH = Symbol('AI_HTTP_FETCH');
export const CHAT_PROVIDER = Symbol('CHAT_PROVIDER');
export const CONTENT_MODERATOR = Symbol('CONTENT_MODERATOR');
export type ProviderId = 'deepseek' | 'openai' | 'openai-compatible';
export type UsagePhase =
  | 'input_moderation'
  | 'generation'
  | 'output_moderation';
export interface ContextMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface UsageRecord {
  provider: ProviderId;
  model: string;
  responseId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}
export interface GeneratedReply extends UsageRecord {
  text: string;
  responseId: string;
}
export type UsageRecorder = (
  phase: UsagePhase,
  record: UsageRecord,
) => Promise<void>;
export interface ChatProvider {
  assertConfigured(): void;
  generate(
    instructions: string,
    messages: ContextMessage[],
    options?: { stream?: boolean },
  ): Promise<GeneratedReply>;
}
export interface ModerationDecision {
  allowed: boolean | null;
  usage: UsageRecord;
}
export interface ContentModerator {
  assertConfigured(): void;
  check(text: string): Promise<ModerationDecision>;
}
export type SafeFailureCode =
  | 'provider_unavailable'
  | 'invalid_completion'
  | 'invalid_moderation'
  | 'usage_record_unavailable'
  | 'upstream_400'
  | 'upstream_402'
  | 'upstream_422'
  | 'upstream_401'
  | 'upstream_403'
  | 'upstream_404'
  | 'upstream_408'
  | 'upstream_429'
  | 'upstream_5xx'
  | 'transport';
export class AiGenerationError extends Error {
  constructor(
    readonly reason: 'provider_unavailable' | 'content_rejected',
    readonly reply?: GeneratedReply,
    readonly safeCode: SafeFailureCode = 'provider_unavailable',
  ) {
    super(reason);
  }
}
