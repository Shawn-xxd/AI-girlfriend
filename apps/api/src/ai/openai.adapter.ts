import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ServerConfig } from '../config';
import {
  AI_CONFIG,
  AI_HTTP_FETCH,
  AiGenerationError,
  type ChatProvider,
  type ContextMessage,
  type GeneratedReply,
} from './ai.types';
import { providerClient, providerError, usageRecord } from './provider-client';
@Injectable()
export class OpenAiAdapter implements ChatProvider {
  private readonly client;
  constructor(
    @Inject(AI_CONFIG) private readonly config: ServerConfig,
    @Optional() @Inject(AI_HTTP_FETCH) fetchImpl?: typeof fetch,
  ) {
    this.client = providerClient(
      config.AI_PROVIDER_API_KEY,
      'https://api.openai.com/v1',
      fetchImpl,
    );
  }
  assertConfigured(): void {
    if (!this.client || !this.config.AI_MODEL)
      throw new ServiceUnavailableException('AI provider is not configured');
  }
  async generate(
    instructions: string,
    messages: ContextMessage[],
  ): Promise<GeneratedReply> {
    this.assertConfigured();
    try {
      const response = await this.client!.responses.create({
        model: this.config.AI_MODEL!,
        instructions,
        input: messages,
        max_output_tokens: this.config.AI_MAX_OUTPUT_TOKENS,
        store: false,
      });
      const usage = usageRecord(
        'openai',
        response.model,
        response.id,
        response.usage?.input_tokens,
        response.usage?.output_tokens,
      );
      const reply = {
        ...usage,
        responseId: response.id,
        text: response.output_text.trim(),
      };
      if (
        response.status !== 'completed' ||
        !reply.text ||
        reply.text.length > 12000
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
