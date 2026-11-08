import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { ServerResponse } from 'node:http';
import { deliverChatStream } from './chat-stream';
import {
  messagePageQuerySchema,
  openConversationSchema,
  sendMessageSchema,
} from '@companion/shared';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { ConversationsService } from './conversations.service';
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException('Invalid chat request');
  return result.data;
}
@Controller('conversations')
@UseGuards(SupabaseAuthGuard)
export class ConversationsController {
  constructor(
    @Inject(ConversationsService)
    private readonly conversations: ConversationsService,
  ) {}
  @Post()
  open(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.conversations.open(
      request.authUserId,
      parse(openConversationSchema, body).characterId,
    );
  }
  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.conversations.list(request.authUserId);
  }
  @Get(':id')
  detail(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.conversations.detail(request.authUserId, parse(z.uuid(), id));
  }
  @Post(':id/messages/stream')
  async stream(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res() response: ServerResponse,
  ) {
    const conversationId = parse(z.uuid(), id);
    const message = parse(sendMessageSchema, body);
    // Reject another user's resource before opening a successful stream.
    await this.conversations.detail(request.authUserId, conversationId);
    await deliverChatStream(response, (onStatus) =>
      this.conversations.send(request.authUserId, conversationId, message, {
        stream: true,
        onStatus,
      }),
    );
  }
  @Get(':id/messages')
  history(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.conversations.history(
      request.authUserId,
      parse(z.uuid(), id),
      parse(messagePageQuerySchema, query),
    );
  }
  @Post(':id/messages')
  send(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.conversations.send(
      request.authUserId,
      parse(z.uuid(), id),
      parse(sendMessageSchema, body),
    );
  }
}
