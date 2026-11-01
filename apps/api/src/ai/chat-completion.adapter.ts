import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type OpenAI from 'openai';
import type { ServerConfig } from '../config';
import {
  AI_CONFIG,
  AI_HTTP_FETCH,
  AiGenerationError,
  type ChatProvider,
  type ContextMessage,
  type GeneratedReply,
  type ProviderId,
} from './ai.types';
import { providerClient, providerError, usageRecord } from './provider-client';
abstract class ChatCompletionAdapter implements ChatProvider {
  private readonly client: OpenAI | undefined;
  protected constructor(
    private readonly provider: ProviderId,
    private readonly model: string | undefined,
    private readonly maxTokens: number,
    key: string | undefined,
    baseURL: string | undefined,
    fetchImpl?: typeof fetch,
  ) {
    this.client = baseURL ? providerClient(key, baseURL, fetchImpl) : undefined;
  }
  assertConfigured(): void {
    if (!this.client || !this.model)
      throw new ServiceUnavailableException('AI provider is not configured');
  }
  async generate(
    instructions: string,
    messages: ContextMessage[],
  ): Promise<GeneratedReply> {
    this.assertConfigured();
    try {
      const response = await this.client!.chat.completions.create({
        model: this.model!,
        messages: [{ role: 'system', content: instructions }, ...messages],
        max_tokens: this.maxTokens,
        stream: false,
      });
      const usage = usageRecord(
        this.provider,
        response.model,
        response.id,
        response.usage?.prompt_tokens,
        response.usage?.completion_tokens,
      );
      // Intentionally ignore provider-specific reasoning_content and tool calls.
      const text = response.choices[0]?.message.content?.trim() ?? '';
      const reply = { ...usage, responseId: response.id, text };
      if (
        response.choices[0]?.finish_reason !== 'stop' ||
        !text ||
        text.length > 12000
      )
        throw new AiGenerationError(
          'provider_unavailable',
          reply,
          'invalid_completion',
        );
      return reply;
    } catch (error) {
      throw providerError(error);
    }
  }
}
@Injectable()
export class DeepSeekAdapter extends ChatCompletionAdapter {
  constructor(
    @Inject(AI_CONFIG) config: ServerConfig,
    @Optional() @Inject(AI_HTTP_FETCH) fetchImpl?: typeof fetch,
  ) {
    super(
      'deepseek',
      config.AI_MODEL,
      config.AI_MAX_OUTPUT_TOKENS,
      config.DEEPSEEK_API_KEY,
      'https://api.deepseek.com',
      fetchImpl,
    );
  }
}
@Injectable()
export class CompatibleChatAdapter extends ChatCompletionAdapter {
  constructor(
    @Inject(AI_CONFIG) config: ServerConfig,
    @Optional() @Inject(AI_HTTP_FETCH) fetchImpl?: typeof fetch,
  ) {
    super(
      'openai-compatible',
      config.AI_MODEL,
      config.AI_MAX_OUTPUT_TOKENS,
      config.AI_COMPATIBLE_API_KEY,
      config.AI_BASE_URL,
      fetchImpl,
    );
  }
}
