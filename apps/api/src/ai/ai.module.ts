import { Module } from '@nestjs/common';
import type { ServerConfig } from '../config';
import { parseConfig } from '../config';
import {
  AI_CONFIG,
  CHAT_PROVIDER,
  CONTENT_MODERATOR,
  type ChatProvider,
  type ContentModerator,
} from './ai.types';
import { AiGateway } from './ai.gateway';
import { OpenAiAdapter } from './openai.adapter';
import {
  DeepSeekAdapter,
  CompatibleChatAdapter,
} from './chat-completion.adapter';
import { DeepSeekModerator, OpenAiModerator } from './moderation.adapter';
export function selectChatProvider(
  config: ServerConfig,
  providers: Record<ServerConfig['AI_PROVIDER'], ChatProvider>,
): ChatProvider {
  return providers[config.AI_PROVIDER];
}
export function selectModerator(
  config: ServerConfig,
  providers: Record<ServerConfig['MODERATION_PROVIDER'], ContentModerator>,
): ContentModerator {
  return providers[config.MODERATION_PROVIDER];
}
@Module({
  providers: [
    { provide: AI_CONFIG, useFactory: () => parseConfig(process.env) },
    OpenAiAdapter,
    DeepSeekAdapter,
    CompatibleChatAdapter,
    DeepSeekModerator,
    OpenAiModerator,
    {
      provide: CHAT_PROVIDER,
      inject: [
        AI_CONFIG,
        DeepSeekAdapter,
        OpenAiAdapter,
        CompatibleChatAdapter,
      ],
      useFactory: (
        config: ServerConfig,
        deepseek: DeepSeekAdapter,
        openai: OpenAiAdapter,
        compatible: CompatibleChatAdapter,
      ) =>
        selectChatProvider(config, {
          deepseek,
          openai,
          'openai-compatible': compatible,
        }),
    },
    {
      provide: CONTENT_MODERATOR,
      inject: [AI_CONFIG, DeepSeekModerator, OpenAiModerator],
      useFactory: (
        config: ServerConfig,
        deepseek: DeepSeekModerator,
        openai: OpenAiModerator,
      ) => selectModerator(config, { deepseek, openai }),
    },
    AiGateway,
  ],
  exports: [AiGateway],
})
export class AiModule {}
