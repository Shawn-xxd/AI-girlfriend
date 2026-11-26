import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useMobileViewer } from '../api/queries';
import { useCharacterCatalog } from '../api/character-catalog';
import { characterCover } from '../api/character-cover';
import { blockingLoadError, detailQuery } from '../api/loading-policy';
import { mobileApi } from '../api/client';
import { CharacterProfileScreen } from './CharacterProfileScreen';

export function LiveCharacterProfile({ id }: { id: string }) {
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
  return (
    <CharacterProfileScreen
      character={character}
      loading={!unavailable && (!userId || detail.isPending)}
      unavailable={unavailable}
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
        if (guest.status !== 'ready') void guest.retry().catch(() => undefined);
        else {
          void viewer.refetch();
          void detail.refetch();
          void catalog.refetch();
        }
      }}
    />
  );
}
