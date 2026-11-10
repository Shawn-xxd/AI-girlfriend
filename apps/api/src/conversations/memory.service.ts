import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { z } from 'zod';
import { DatabaseService } from '../database.service';
import { AiGateway } from '../ai/ai.gateway';
import { parseConfig } from '../config';
const message = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(12000),
});
const contextSchema = z.object({
  summary: z.string().max(2000),
  messages: z.array(message).max(40),
});
const claimSchema = z.object({
  generationId: z.uuid(),
  previousSummary: z.string().max(2000),
  messages: z.array(message).min(2).max(40),
});
@Injectable()
export class MemoryService implements OnModuleDestroy {
  private readonly config = parseConfig(process.env);
  private readonly jobs = new Map<string, Promise<void>>();
  private readonly logger = new Logger(MemoryService.name);
  private closing = false;
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AiGateway) private readonly ai: AiGateway,
  ) {}
  async context(actor: string, conversation: string) {
    const result = await this.database.client.rpc(
      'companion_memory_context_v1',
      {
        p_actor: actor,
        p_conversation: conversation,
        p_limit: this.config.AI_CONTEXT_TURNS,
        p_max_chars: 24000,
      },
    );
    const parsed = contextSchema.safeParse(result.data);
    if (result.error || !parsed.success)
      throw new ServiceUnavailableException('Chat context unavailable');
    return {
      ...parsed.data,
      summary: this.config.MEMORY_ENABLED ? parsed.data.summary : '',
    };
  }
  schedule(actor: string, conversation: string) {
    if (
      !this.config.MEMORY_ENABLED ||
      this.closing ||
      this.jobs.has(conversation) ||
      this.jobs.size >= 2
    )
      return;
    const task = this.refresh(actor, conversation)
      .catch(() => {
        this.logger.warn(
          'Conversation summary update unavailable; existing memory retained',
        );
      })
      .finally(() => {
        this.jobs.delete(conversation);
      });
    this.jobs.set(conversation, task);
  }
  async drain() {
    await Promise.allSettled([...this.jobs.values()]);
  }
  async onModuleDestroy() {
    this.closing = true;
    await this.drain();
  }
  private async refresh(actor: string, conversation: string) {
    const result = await this.database.client.rpc('companion_claim_memory_v1', {
      p_actor: actor,
      p_conversation: conversation,
      p_batch: this.config.MEMORY_BATCH_TURNS,
      p_max_chars: 24000,
    });
    if (result.error) throw new Error('Summary claim unavailable');
    if (result.data === null) return;
    const claim = claimSchema.parse(result.data);
    try {
      const text = await this.ai.summarize(
        claim.previousSummary,
        claim.messages,
        async (phase, usage) => {
          const saved = await this.database.client.rpc(
            'companion_record_memory_usage_v1',
            {
              p_actor: actor,
              p_conversation: conversation,
              p_generation: claim.generationId,
              p_phase: phase,
              p_provider: usage.provider,
              p_model: usage.model,
              p_response_id: usage.responseId,
              p_input_tokens: usage.inputTokens,
              p_output_tokens: usage.outputTokens,
            },
          );
          if (saved.error) throw new Error('Summary usage unavailable');
        },
      );
      const saved = await this.database.client.rpc(
        'companion_finish_memory_v1',
        {
          p_actor: actor,
          p_conversation: conversation,
          p_generation: claim.generationId,
          p_summary: text,
        },
      );
      if (saved.error) throw new Error('Summary save unavailable');
    } catch {
      try {
        await this.database.client.rpc('companion_finish_memory_v1', {
          p_actor: actor,
          p_conversation: conversation,
          p_generation: claim.generationId,
          p_summary: null,
        });
      } catch {
        /* A later chat can retry after the lease/cooldown. */
      }
      throw new Error('Summary update unavailable');
    }
  }
}
