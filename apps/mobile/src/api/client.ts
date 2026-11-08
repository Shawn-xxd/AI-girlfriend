import {
  characterListSchema,
  chatReplySchema,
  conversationListSchema,
  conversationDetailSchema,
  conversationSchema,
  currentUserSchema,
  messagePageSchema,
  openConversationSchema,
  sendMessageSchema,
} from '@companion/shared';
import { ensureGuestSession } from '../auth';
import { createMobileApi } from './core';
import { createChatStream } from './stream';
import { fetch as streamFetch } from 'expo/fetch';
const request = createMobileApi(
  process.env.EXPO_PUBLIC_API_URL,
  ensureGuestSession,
  fetch,
  typeof __DEV__ !== 'undefined' && __DEV__,
);
export const mobileApi = {
  stream: createChatStream(
    process.env.EXPO_PUBLIC_API_URL,
    ensureGuestSession,
    streamFetch,
    typeof __DEV__ !== 'undefined' && __DEV__,
  ),
  conversation: (userId: string, id: string, signal?: AbortSignal) =>
    request(`/v1/conversations/${id}`, conversationDetailSchema, {
      userId,
      signal,
    }),
  viewer: (signal?: AbortSignal) =>
    request('/v1/me', currentUserSchema, { signal }),
  characters: (userId: string, signal?: AbortSignal) =>
    request('/v1/characters', characterListSchema, { userId, signal }),
  conversations: (userId: string, signal?: AbortSignal) =>
    request('/v1/conversations', conversationListSchema, { userId, signal }),
  openConversation: (userId: string, characterId: string) =>
    request('/v1/conversations', conversationSchema, {
      userId,
      method: 'POST',
      body: openConversationSchema.parse({ characterId }),
    }),
  messages: (
    userId: string,
    id: string,
    signal?: AbortSignal,
    before?: number,
  ) =>
    request(
      `/v1/conversations/${id}/messages?limit=50${before === undefined ? '' : `&before=${before}`}`,
      messagePageSchema,
      { userId, signal },
    ),
  send: (
    userId: string,
    id: string,
    body: { requestKey: string; text: string },
  ) =>
    request(`/v1/conversations/${id}/messages`, chatReplySchema, {
      userId,
      method: 'POST',
      body: sendMessageSchema.parse(body),
      timeoutMs: 110000,
    }),
};
