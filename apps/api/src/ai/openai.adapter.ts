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
    options?: { stream?: boolean },
  ): Promise<GeneratedReply> {
    this.assertConfigured();
    if (options?.stream) return this.generateStream(instructions, messages);
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
  private async generateStream(
    instructions: string,
    messages: ContextMessage[],
  ): Promise<GeneratedReply> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let reply: GeneratedReply | undefined;
    try {
      const stream = await this.client!.responses.create(
        {
          model: this.config.AI_MODEL!,
          instructions,
          input: messages,
          max_output_tokens: this.config.AI_MAX_OUTPUT_TOKENS,
          store: false,
          stream: true,
        },
        { signal: controller.signal },
      );
      let length = 0;
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          length += event.delta.length;
          if (length > 12000)
            throw new AiGenerationError(
              'provider_unavailable',
              reply,
              'invalid_completion',
            );
        }
        if (
          event.type === 'response.completed' ||
          event.type === 'response.incomplete' ||
          event.type === 'response.failed'
        ) {
          const response = event.response;
          const text = response.output
            .flatMap((item) =>
              item.type === 'message'
                ? item.content.flatMap((content) =>
                    content.type === 'output_text' ? [content.text] : [],
                  )
                : [],
            )
            .join('')
            .trim();
          reply = {
            ...usageRecord(
              'openai',
              response.model,
              response.id,
              response.usage?.input_tokens,
              response.usage?.output_tokens,
            ),
            responseId: response.id,
            text,
          };
          if (
            event.type !== 'response.completed' ||
            response.status !== 'completed'
          )
            throw new AiGenerationError(
              'provider_unavailable',
              reply,
              'invalid_completion',
            );
        }
        if (event.type === 'error')
          throw new AiGenerationError('provider_unavailable', reply);
      }
      if (!reply || !reply.text || reply.text.length > 12000)
        throw new AiGenerationError(
          'provider_unavailable',
          reply,
          'invalid_completion',
        );
      return reply;
    } catch (error) {
      throw providerError(error, reply);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
}
