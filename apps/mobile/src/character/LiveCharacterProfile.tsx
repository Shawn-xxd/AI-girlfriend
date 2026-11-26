import { router, Stack } from 'expo-router';
import { Alert } from 'react-native';
import { useRef } from 'react';
import { randomUUID } from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { historyIntents, useHistoryIntents } from '../chat/history-intents';
import { finishHistoryAction } from '../chat/history-actions';
import type { DisplayCharacter } from '../chat/CharacterHeader';
import { useQuery } from '@tanstack/react-query';
import { useMobileViewer } from '../api/queries';
import { useCharacterCatalog } from '../api/character-catalog';
import { characterCover } from '../api/character-cover';
import { blockingLoadError, detailQuery } from '../api/loading-policy';
import { mobileApi } from '../api/client';
import { CharacterProfileScreen } from './CharacterProfileScreen';

export function LiveCharacterProfile({ id }: { id: string }) {
  const cache = useQueryClient();
  const frozen = useRef<{ owner: string; character: DisplayCharacter } | null>(
    null,
  );
  const { guest, viewer, userId, viewerUnavailable } = useMobileViewer({
    refreshOnMount: false,
  });
  const catalog = useCharacterCatalog(userId);
  const detail = useQuery({
    ...detailQuery(userId ?? '', id, mobileApi.conversation),
    enabled: !!userId,
  });
  const unavailable =
    guest.status === 'error' ||
    viewerUnavailable ||
    blockingLoadError(detail.error, detail.data);
  const character =
    userId && detail.data && !unavailable
      ? {
          ...(catalog.data?.characters.find(
            (item) => item.id === detail.data.character.id,
          ) ?? detail.data.character),
          coverUrl: characterCover(
            detail.data.character,
            catalog.data?.characters,
          ),
        }
      : undefined;
  const pending = useHistoryIntents(userId).find(
    (item) => item.conversationId === id,
  );
  if (character && userId) frozen.current = { owner: userId, character };
  const display =
    character ??
    (pending && frozen.current && frozen.current.owner === userId
      ? frozen.current.character
      : undefined);
  const action = useMutation({
    mutationFn: async (kind: 'clear' | 'delete') => {
      if (!userId) throw new Error('Your connection needs to be restored.');
      const intent = await historyIntents.begin(userId, id, kind, randomUUID);
      return finishHistoryAction(userId, intent, cache);
    },
    retry: false,
    onSuccess: (result) => {
      router.dismissAll();
      router.replace('/(tabs)/chats');
      if (result.conversationId)
        router.push({
          pathname: '/conversation/[id]',
          params: { id: result.conversationId },
        });
    },
  });
  function confirm(kind: 'clear' | 'delete') {
    if (action.isPending) return;
    if (pending?.action === kind) {
      action.mutate(kind);
      return;
    }
    Alert.alert(
      kind === 'clear' ? 'Clear chat history?' : 'Delete this chat?',
      kind === 'clear'
        ? 'Messages and the character’s memory will be cleared. Your level, diamonds and unlocked photos will stay.'
        : 'This chat and its messages will be removed from Chats, and the character’s memory will be cleared. Your level, diamonds and unlocked photos will stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: kind === 'clear' ? 'Clear chat' : 'Delete',
          style: 'destructive',
          onPress: () => action.mutate(kind),
        },
      ],
    );
  }
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !action.isPending }} />
      <CharacterProfileScreen
        character={display}
        onClear={
          userId && (display || pending) ? () => confirm('clear') : undefined
        }
        onDelete={
          userId && (display || pending) ? () => confirm('delete') : undefined
        }
        actionBusy={action.isPending}
        pendingAction={pending?.action}
        actionError={
          action.isError
            ? `Action could not be confirmed. Tap ${(pending?.action ?? action.variables) === 'delete' ? 'DELETE' : 'CLEAR CHAT'} to retry.`
            : null
        }
        loading={!display && !unavailable && (!userId || detail.isPending)}
        unavailable={!display && unavailable}
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace({ pathname: '/conversation/[id]', params: { id } })
        }
        onGallery={() =>
          router.navigate({ pathname: '/gallery/[id]', params: { id } })
        }
        onChat={() =>
          router.dismissTo({ pathname: '/conversation/[id]', params: { id } })
        }
        onRetry={() => {
          if (guest.status !== 'ready')
            void guest.retry().catch(() => undefined);
          else {
            void viewer.refetch();
            void detail.refetch();
            void catalog.refetch();
          }
        }}
      />
    </>
  );
}
