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
export const conversationListSchema = z.object({
  conversations: z.array(conversationSchema),
});
export const messageSchema = z.object({
  id: z.uuid(),
  turnId: z.uuid(),
  requestKey: z.uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  sequence: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  state: z.enum(['pending', 'completed', 'failed', 'rejected']),
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
