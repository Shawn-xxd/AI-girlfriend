import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useMobileViewer } from '../api/queries';
import { mobileApi } from '../api/client';
import { GalleryScreen } from './GalleryScreen';
export function LiveGallery({ id }: { id: string }) {
  const { guest, viewer, userId } = useMobileViewer({ refreshOnMount: false });
  const detail = useQuery({
    queryKey: ['mobile-api', userId, 'conversation', id],
    queryFn: ({ signal }) => mobileApi.conversation(userId!, id, signal),
    enabled: !!userId,
    retry: false,
  });
  const unavailable =
    guest.status === 'error' || viewer.isError || detail.isError;
  return (
    <GalleryScreen
      character={userId ? detail.data?.character : undefined}
      unavailable={unavailable}
      loading={!unavailable && (!userId || detail.isPending)}
      onRetry={() => {
        if (guest.status !== 'ready') void guest.retry().catch(() => undefined);
        else {
          void viewer.refetch();
          void detail.refetch();
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
