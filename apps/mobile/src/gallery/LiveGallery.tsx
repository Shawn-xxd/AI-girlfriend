import { router } from 'expo-router';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMobileViewer } from '../api/queries';
import { mobileApi } from '../api/client';
import { GalleryScreen } from './GalleryScreen';
import { LevelPhotoCard } from './LevelPhotoCard';
export function LiveGallery({ id }: { id: string }) {
  const cache = useQueryClient();
  const { guest, viewer, userId } = useMobileViewer({ refreshOnMount: false });
  const detail = useQuery({
    queryKey: ['mobile-api', userId, 'conversation', id],
    queryFn: ({ signal }) => mobileApi.conversation(userId!, id, signal),
    enabled: !!userId,
    retry: false,
  });
  const gallery = useQuery({
    queryKey: ['mobile-api', userId, 'gallery', id],
    queryFn: ({ signal }) => mobileApi.gallery(userId!, id, signal),
    enabled: !!userId,
    retry: false,
  });
  useEffect(() => {
    // Gallery sync can grant newly configured rewards; refresh the mounted chat without touching its viewer/draft.
    if (userId && gallery.dataUpdatedAt)
      void cache.invalidateQueries({
        queryKey: ['mobile-api', userId, 'timeline', id],
      });
  }, [cache, userId, id, gallery.dataUpdatedAt]);
  const unavailable =
    guest.status === 'error' ||
    viewer.isError ||
    detail.isError ||
    gallery.isError;
  return (
    <GalleryScreen
      character={userId ? detail.data?.character : undefined}
      level={gallery.data?.progress.level}
      remotePhotos={userId ? gallery.data?.photos : []}
      renderPhoto={(photo) =>
        userId ? (
          <LevelPhotoCard
            owner={userId}
            conversation={id}
            photo={photo}
            gallery
          />
        ) : null
      }
      unavailable={unavailable}
      loading={
        !unavailable && (!userId || detail.isPending || gallery.isPending)
      }
      onRetry={() => {
        if (guest.status !== 'ready') void guest.retry().catch(() => undefined);
        else {
          void viewer.refetch();
          void detail.refetch();
          void gallery.refetch();
        }
      }}
      onBack={() =>
        router.canGoBack()
          ? router.back()
          : router.replace({ pathname: '/conversation/[id]', params: { id } })
      }
    />
  );
}
