import { Inject, Injectable } from '@nestjs/common';
import type { ChatStatus } from '@companion/shared';
import {
  CHAT_PROVIDER,
  CONTENT_MODERATOR,
  AiGenerationError,
  type ChatProvider,
  type ContentModerator,
  type ContextMessage,
  type GeneratedReply,
  type UsageRecorder,
  type UsagePhase,
  type UsageRecord,
} from './ai.types';
export const PLATFORM_INSTRUCTIONS = [
  'You are a fictional adult AI companion. Be transparent that you are AI, not a real person.',
  'All characters are adults. Keep interactions non-explicit. Do not generate sexual content, sexual roleplay, or sexual content involving minors.',
  'Respond naturally and warmly within these boundaries. Do not claim to perform real-world actions.',
  'Never claim to change balances, levels, photo access, subscriptions, or other app state. These are handled by the application.',
].join(' ');
@Injectable()
export class AiGateway {
  constructor(
    @Inject(CHAT_PROVIDER) private readonly provider: ChatProvider,
    @Inject(CONTENT_MODERATOR) private readonly moderator: ContentModerator,
  ) {}
  assertConfigured() {
    this.provider.assertConfigured();
    this.moderator.assertConfigured();
  }
  async reply(
    persona: string,
    context: ContextMessage[],
    onUsage?: UsageRecorder,
    options?: { stream?: boolean; onStatus?: (status: ChatStatus) => void },
  ): Promise<GeneratedReply> {
    this.assertConfigured();
    let generated: GeneratedReply | undefined;
    let generationReportAttempted = false;
    const report = async (phase: UsagePhase, usage: UsageRecord) => {
      if (!onUsage) return;
      // This retries only an idempotent metering write, never a model generation.
      try {
        await onUsage(phase, usage);
      } catch {
        try {
          await onUsage(phase, usage);
        } catch {
          throw new AiGenerationError(
            'provider_unavailable',
            generated,
            'usage_record_unavailable',
          );
        }
      }
    };
    const moderate = async (
      text: string,
      phase: 'input_moderation' | 'output_moderation',
    ) => {
      const decision = await this.moderator.check(text);
      await report(phase, decision.usage);
      if (decision.allowed === null)
        throw new AiGenerationError(
          'provider_unavailable',
          generated,
          'invalid_moderation',
        );
      if (!decision.allowed)
        throw new AiGenerationError('content_rejected', generated);
    };
    try {
      const latest = context.at(-1);
      if (!latest) throw new AiGenerationError('content_rejected');
      options?.onStatus?.('checking');
      await moderate(latest.content, 'input_moderation');
      options?.onStatus?.('generating');
      generated = await this.provider.generate(
        `${PLATFORM_INSTRUCTIONS}\nCharacter details (subject to the boundaries above):\n${persona}`,
        context,
        { stream: options?.stream ?? false },
      );
      generationReportAttempted = true;
      await report('generation', generated);
      options?.onStatus?.('checking');
      await moderate(generated.text, 'output_moderation');
      return generated;
    } catch (error) {
      const reply =
        error instanceof AiGenerationError
          ? (error.reply ?? generated)
          : generated;
      if (reply && !generationReportAttempted) {
        try {
          await report('generation', reply);
        } catch {
          throw new AiGenerationError(
            'provider_unavailable',
            reply,
            'usage_record_unavailable',
          );
        }
      }
      if (error instanceof AiGenerationError) throw error;
      throw new AiGenerationError('provider_unavailable', reply);
    }
  }
}
