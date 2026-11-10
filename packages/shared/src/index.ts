import { z } from 'zod';
export const healthResponseSchema = z.object({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const currentUserSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;
export const characterSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(64),
  archetype: z.string().min(1).max(64),
  bio: z.string().max(2000),
  tags: z.array(z.string()),
});
export const characterListSchema = z.object({
  characters: z.array(characterSchema),
});
export type CharacterList = z.infer<typeof characterListSchema>;

export const openConversationSchema = z
  .object({ characterId: z.uuid() })
  .strict();
export const sendMessageSchema = z
  .object({ requestKey: z.uuid(), text: z.string().trim().min(1).max(4000) })
  .strict();
export const messagePageQuerySchema = z
  .object({
    before: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
export const conversationSchema = z.object({
  id: z.uuid(),
  characterId: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
});
export const messageSchema = z.object({
  id: z.uuid(),
  turnId: z.uuid(),
  requestKey: z.uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(12000),
  sequence: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  state: z.enum(['pending', 'completed', 'failed', 'rejected']),
  leaseExpiresAt: z.iso.datetime({ offset: true }).nullable(),
});
export const messagePageSchema = z.object({
  messages: z.array(messageSchema),
  nextBefore: z.number().int().positive().nullable(),
});
export const chatReplySchema = z.object({
  turnId: z.uuid(),
  state: z.literal('completed'),
  messages: z.array(messageSchema).length(2),
});
export type Message = z.infer<typeof messageSchema>;
export type Conversation = z.infer<typeof conversationSchema>;

export const conversationDetailSchema = conversationSchema.extend({
  character: characterSchema,
});
export const conversationSummarySchema = conversationSchema.extend({
  character: characterSchema,
  lastMessage: z
    .object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(12000),
      createdAt: z.iso.datetime({ offset: true }),
    })
    .nullable(),
});
export const conversationListSchema = z.object({
  conversations: z.array(conversationSummarySchema),
});
export type Character = z.infer<typeof characterSchema>;
export type ChatReply = z.infer<typeof chatReplySchema>;
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export const chatStatusSchema = z.enum(['checking', 'generating', 'saving']);
export type ChatStatus = z.infer<typeof chatStatusSchema>;
export const chatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), status: chatStatusSchema }).strict(),
  z.object({ type: z.literal('completed'), reply: chatReplySchema }).strict(),
  z
    .object({
      type: z.literal('error'),
      status: z.union([
        z.literal(400),
        z.literal(401),
        z.literal(404),
        z.literal(409),
        z.literal(422),
        z.literal(429),
        z.literal(503),
      ]),
    })
    .strict(),
]);
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;

export const characterProgressSchema = z.object({
  level: z.number().int().min(1).max(1000),
  effectiveChatCount: z.number().int().nonnegative(),
  nextLevel: z
    .object({
      level: z.number().int().min(2).max(1000),
      requiredCount: z.number().int().positive(),
    })
    .nullable(),
});
export const levelPhotoSchema = z.object({
  id: z.uuid(),
  kind: z.literal('level'),
  title: z.string().min(1).max(64),
  requiredLevel: z.number().int().min(1).max(1000),
  unlocked: z.boolean(),
  available: z.boolean(),
});
export const photoTimelineEntrySchema = z.object({
  kind: z.literal('photo'),
  id: z.uuid(),
  role: z.literal('assistant'),
  sequence: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  photo: levelPhotoSchema,
});
export const timelineEntrySchema = z.discriminatedUnion('kind', [
  messageSchema.extend({ kind: z.literal('text') }),
  photoTimelineEntrySchema,
]);
export const timelinePageSchema = z.object({
  entries: z.array(timelineEntrySchema),
  nextBefore: z.number().int().positive().nullable(),
  progress: characterProgressSchema,
});
export const levelGallerySchema = z.object({
  photos: z.array(levelPhotoSchema),
  progress: characterProgressSchema,
});
export const photoAccessSchema = z.object({
  url: z.url().refine((value) => new URL(value).protocol === 'https:'),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type CharacterProgress = z.infer<typeof characterProgressSchema>;
export type LevelPhoto = z.infer<typeof levelPhotoSchema>;
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
export type PhotoAccess = z.infer<typeof photoAccessSchema>;
