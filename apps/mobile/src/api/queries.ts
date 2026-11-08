import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useGuestSession } from '../auth';
import { mobileApi } from './client';
export const discoverPreview = process.env.EXPO_PUBLIC_DISCOVER_PREVIEW === '1';
export function useMobileViewer(options: { refreshOnMount?: boolean } = {}) {
  const guest = useGuestSession();
  const cache = useQueryClient();
  const previous = useRef(guest.status);
  useEffect(() => {
    if (previous.current === 'ready' && guest.status !== 'ready')
      cache.removeQueries({ queryKey: ['mobile-api'] });
    previous.current = guest.status;
  }, [guest.status, cache]);
  const viewer = useQuery({
    queryKey: ['mobile-api', 'viewer'],
    queryFn: ({ signal }) => mobileApi.viewer(signal),
    enabled: !discoverPreview && guest.status === 'ready',
    staleTime: 0,
    refetchOnMount: options.refreshOnMount === false ? false : 'always',
    refetchOnWindowFocus: false,
    retry: false,
  });
  return {
    guest,
    viewer,
    userId:
      guest.status === 'ready' && !viewer.isFetching
        ? viewer.data?.id
        : undefined,
  };
}
