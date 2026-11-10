import { create } from 'zustand';
import { previewCharacters } from '../discover/preview';
import type { LevelPhoto } from '@companion/shared';
export interface ChatRow {
  id: string;
  kind?: 'text' | 'photo';
  role: 'user' | 'assistant';
  content: string;
  state?: 'pending' | 'completed' | 'failed' | 'rejected';
  requestKey?: string;
  expired?: boolean;
  photo?: LevelPhoto;
}
interface PreviewThread {
  characterId: string;
  rows: ChatRow[];
  openedPhotoIds: string[];
  updatedAt: string;
}
export const useChatPreview = create<{ threads: PreviewThread[] }>(() => ({
  threads: [],
}));
export function openPreviewConversation(characterId: string) {
  if (!previewCharacters.some((character) => character.id === characterId))
    return;
  useChatPreview.setState((state) =>
    state.threads.some((thread) => thread.characterId === characterId)
      ? state
      : {
          threads: [
            {
              characterId,
              rows: [],
              openedPhotoIds: [],
              updatedAt: new Date().toISOString(),
            },
            ...state.threads,
          ],
        },
  );
}
/** Reveal an existing design card in its chat frame; this grants no server entitlement. */
export function revealPreviewPhoto(characterId: string, photoId: string) {
  if (
    !previewRows(characterId).some(
      (row) => row.id === photoId && row.kind === 'photo',
    )
  )
    return;
  openPreviewConversation(characterId);
  useChatPreview.setState((state) => ({
    threads: state.threads.map((thread) =>
      thread.characterId === characterId &&
      !thread.openedPhotoIds.includes(photoId)
        ? { ...thread, openedPhotoIds: [...thread.openedPhotoIds, photoId] }
        : thread,
    ),
  }));
}
export function appendPreviewMessage(characterId: string, text: string) {
  openPreviewConversation(characterId);
  useChatPreview.setState((state) => ({
    threads: state.threads.map((thread) =>
      thread.characterId === characterId
        ? {
            ...thread,
            updatedAt: new Date().toISOString(),
            rows: [
              ...thread.rows,
              {
                id: `preview-user-${thread.rows.length}`,
                role: 'user',
                content: text,
              },
            ],
          }
        : thread,
    ),
  }));
}
/** Fixed layout examples, not generated responses or production opening messages. */
export function previewRows(characterId: string): ChatRow[] {
  const character = previewCharacters.find(
    (character) => character.id === characterId,
  );
  if (!character) return [];
  return [
    {
      id: 'preview-hello',
      role: 'assistant',
      content: `Hey there, handsome! 😊 I’m ${character.name}. Coffee, a little playful banter, and getting to know you—sounds like a good start.`,
    },
    {
      id: 'preview-question',
      role: 'assistant',
      content: 'Tell me—what does your perfect evening look like? ✨',
    },
    {
      id: 'preview-photo',
      kind: 'photo',
      role: 'assistant',
      content: 'PHOTO ✨',
    },
  ];
}
