import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { previewCharacters } from '../discover/preview';
import {
  appendPreviewMessage,
  openPreviewConversation,
  previewRows,
  useChatPreview,
} from './preview';
import { ChatScreen } from './ChatScreen';
export function PreviewConversation({ id }: { id: string }) {
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const thread = useChatPreview((state) =>
    state.threads.find((thread) => thread.characterId === id),
  );
  const character = previewCharacters.find((character) => character.id === id);
  useEffect(() => {
    openPreviewConversation(id);
  }, [id]);
  if (!character) return null;
  return (
    <ChatScreen
      character={character}
      rows={[...previewRows(id), ...(thread?.rows ?? [])]}
      preview
      onGallery={() =>
        router.push({ pathname: '/gallery/[id]', params: { id } })
      }
      text={text}
      onText={setText}
      error={notice}
      onSend={() => {
        if (!text.trim()) return;
        appendPreviewMessage(id, text.trim());
        setText('');
        setNotice('Preview only. AI replies aren’t connected.');
      }}
      onBack={() =>
        router.canGoBack() ? router.back() : router.replace('/(tabs)')
      }
    />
  );
}
