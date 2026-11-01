import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  chatReplySchema,
  conversationListSchema,
  conversationSchema,
  messagePageSchema,
  messageSchema,
  type Message,
} from '@companion/shared';
import { DatabaseService } from '../database.service';
import { AiGateway } from '../ai/ai.gateway';
import { AiGenerationError, type GeneratedReply } from '../ai/ai.types';
import { parseConfig } from '../config';
const claimSchema = z.object({
  turnId: z.uuid(),
  generationId: z.uuid(),
  state: z.enum(['pending', 'completed', 'rejected']),
});
function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ServiceUnavailableException('Chat data unavailable');
  return result.data;
}
function databaseError(error: { code: string } | null) {
  if (!error) return;
  if (error.code === 'P0002')
    throw new NotFoundException('Conversation or character unavailable');
  if (error.code === 'PT409')
    throw new ConflictException('Request conflict or reply in progress');
  if (error.code === 'PT400')
    throw new BadRequestException('Invalid chat request');
  throw new ServiceUnavailableException('Chat data unavailable');
}
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AiGateway) private readonly ai: AiGateway,
  ) {}
  async open(actor: string, character: string) {
    const result = await this.database.client.rpc(
      'companion_open_conversation_v1',
      { p_actor: actor, p_character: character },
    );
    databaseError(result.error);
    if (!result.data)
      throw new ServiceUnavailableException('Chat data unavailable');
    return this.owned(actor, result.data).then((row) =>
      checked(conversationSchema, {
        id: row.id,
        characterId: row.character_id,
        createdAt: row.created_at,
      }),
    );
  }
  async list(actor: string) {
    const result = await this.database.client
      .from('companion_conversations')
      .select('id,character_id,created_at')
      .eq('user_id', actor)
      .order('created_at', { ascending: false })
      .order('id')
      .limit(50);
    databaseError(result.error);
    return checked(conversationListSchema, {
      conversations: result.data?.map((r) => ({
        id: r.id,
        characterId: r.character_id,
        createdAt: r.created_at,
      })),
    });
  }
  private async owned(actor: string, id: string) {
    const result = await this.database.client
      .from('companion_conversations')
      .select('id,character_id,created_at')
      .eq('id', id)
      .eq('user_id', actor)
      .maybeSingle();
    databaseError(result.error);
    if (!result.data) throw new NotFoundException('Conversation unavailable');
    return result.data;
  }
  private async messagesFor(
    rows: {
      id: string;
      turn_id: string;
      role: string;
      content: string;
      sequence: number;
      created_at: string;
    }[],
  ): Promise<Message[]> {
    if (!rows.length) return [];
    const turns = await this.database.client
      .from('companion_chat_turns')
      .select('id,request_key,state')
      .in('id', [...new Set(rows.map((r) => r.turn_id))]);
    databaseError(turns.error);
    const byId = new Map(turns.data?.map((t) => [t.id, t]));
    return rows.map((r) =>
      checked(messageSchema, {
        id: r.id,
        turnId: r.turn_id,
        requestKey: byId.get(r.turn_id)?.request_key,
        role: r.role,
        content: r.content,
        sequence: r.sequence,
        createdAt: r.created_at,
        state: byId.get(r.turn_id)?.state,
      }),
    );
  }
  async history(
    actor: string,
    id: string,
    query: { before?: number; limit: number },
  ) {
    await this.owned(actor, id);
    let request = this.database.client
      .from('companion_messages')
      .select('id,turn_id,role,content,sequence,created_at')
      .eq('conversation_id', id)
      .order('sequence', { ascending: false })
      .limit(query.limit + 1);
    if (query.before) request = request.lt('sequence', query.before);
    const result = await request;
    databaseError(result.error);
    const more = (result.data?.length ?? 0) > query.limit;
    const rows = (result.data ?? []).slice(0, query.limit).reverse();
    return checked(messagePageSchema, {
      messages: await this.messagesFor(rows),
      nextBefore: more ? rows[0]?.sequence : null,
    });
  }
  private async completed(id: string, conversation: string) {
    const result = await this.database.client
      .from('companion_messages')
      .select('id,turn_id,role,content,sequence,created_at')
      .eq('conversation_id', conversation)
      .eq('turn_id', id)
      .order('sequence');
    databaseError(result.error);
    return checked(chatReplySchema, {
      turnId: id,
      state: 'completed',
      messages: await this.messagesFor(result.data ?? []),
    });
  }
  async send(
    actor: string,
    id: string,
    request: { requestKey: string; text: string },
  ) {
    const conversation = await this.owned(actor, id);
    const previous = await this.database.client
      .from('companion_chat_turns')
      .select('id,state')
      .eq('conversation_id', id)
      .eq('request_key', request.requestKey)
      .maybeSingle();
    databaseError(previous.error);
    if (
      previous.data?.state === 'completed' ||
      previous.data?.state === 'rejected'
    ) {
      const original = await this.database.client
        .from('companion_messages')
        .select('content')
        .eq('turn_id', previous.data.id)
        .eq('role', 'user')
        .single();
      databaseError(original.error);
      if (original.data?.content !== request.text)
        throw new ConflictException(
          'Request key already used for different text',
        );
      if (previous.data.state === 'rejected')
        throw new UnprocessableEntityException(
          'Message could not be processed within content boundaries',
        );
      return this.completed(previous.data.id, id);
    }
    this.ai.assertConfigured();
    const started = await this.database.client.rpc('companion_begin_turn_v1', {
      p_actor: actor,
      p_conversation: id,
      p_key: request.requestKey,
      p_content: request.text,
    });
    databaseError(started.error);
    const claim = checked(claimSchema, started.data);
    if (claim.state === 'completed') return this.completed(claim.turnId, id);
    if (claim.state === 'rejected')
      throw new UnprocessableEntityException(
        'Message could not be processed within content boundaries',
      );
    let generated: GeneratedReply | undefined;
    try {
      const character = await this.database.client
        .from('companion_characters')
        .select('name,archetype,bio,system_prompt')
        .eq('id', conversation.character_id)
        .single();
      databaseError(character.error);
      if (!character.data)
        throw new ServiceUnavailableException('Character unavailable');
      const turns = await this.database.client
        .from('companion_chat_turns')
        .select('id')
        .eq('conversation_id', id)
        .eq('state', 'completed')
        .order('completed_at', { ascending: false })
        .limit(parseConfig(process.env).AI_CONTEXT_TURNS);
      databaseError(turns.error);
      const context = turns.data?.length
        ? await this.database.client
            .from('companion_messages')
            .select('role,content')
            .eq('conversation_id', id)
            .in(
              'turn_id',
              turns.data.map((t) => t.id),
            )
            .order('sequence')
        : { data: [], error: null };
      databaseError(context.error);
      generated = await this.ai.reply(
        [
          character.data.name,
          character.data.archetype,
          character.data.bio,
          character.data.system_prompt,
        ].join('\n'),
        [...(context.data ?? []), { role: 'user', content: request.text }],
        async (phase, usage) => {
          const recorded = await this.database.client.rpc(
            'companion_record_ai_usage_v1',
            {
              p_actor: actor,
              p_turn: claim.turnId,
              p_generation: claim.generationId,
              p_phase: phase,
              p_provider: usage.provider,
              p_model: usage.model,
              p_response_id: usage.responseId,
              p_input_tokens: usage.inputTokens,
              p_output_tokens: usage.outputTokens,
            },
          );
          databaseError(recorded.error);
        },
      );
      const saved = await this.database.client.rpc(
        'companion_complete_turn_v1',
        {
          p_actor: actor,
          p_turn: claim.turnId,
          p_generation: claim.generationId,
          p_text: generated.text,
          p_model: `${generated.provider}:${generated.model}`,
          p_response_id: generated.responseId,
          p_input_tokens: generated.inputTokens,
          p_output_tokens: generated.outputTokens,
        },
      );
      databaseError(saved.error);
      return await this.completed(claim.turnId, id);
    } catch (error) {
      if (error instanceof AiGenerationError)
        this.logger.warn(`AI request failed: ${error.safeCode}`);
      const rejected =
        error instanceof AiGenerationError &&
        error.reason === 'content_rejected';
      const usage =
        error instanceof AiGenerationError
          ? (error.reply ?? generated)
          : generated;
      try {
        const failed = await this.database.client.rpc(
          'companion_fail_turn_v1',
          {
            p_actor: actor,
            p_turn: claim.turnId,
            p_generation: claim.generationId,
            p_reason: rejected ? 'content_rejected' : 'provider_unavailable',
            p_model: usage ? `${usage.provider}:${usage.model}` : null,
            p_response_id: usage?.responseId ?? null,
            p_input_tokens: usage?.inputTokens ?? null,
            p_output_tokens: usage?.outputTokens ?? null,
          },
        );
        if (failed.error)
          this.logger.error('Unable to persist chat failure state');
      } catch {
        this.logger.error('Unable to persist chat failure state');
      }
      if (rejected)
        throw new UnprocessableEntityException(
          'Message could not be processed within content boundaries',
        );
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException(
        'Reply unavailable; retry with the same request key',
      );
    }
  }
}
