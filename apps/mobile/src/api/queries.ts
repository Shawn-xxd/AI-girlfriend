import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useGuestSession } from '../auth';
import { mobileApi } from './client';
import { viewerOwner, viewerQuery } from './loading-policy';
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
  const owner = guest.status === 'ready' ? guest.owner : undefined;
  const viewer = useQuery({
    ...viewerQuery(owner, (signal) => mobileApi.viewer(signal)),
    enabled: !discoverPreview && !!owner,
    refetchOnMount: options.refreshOnMount === false ? false : true,
  });
  const userId = viewerOwner(guest, viewer.data, viewer.error);
  return {
    catalogOwner: viewer.isError && !userId ? undefined : owner,
    guest,
    viewer,
    userId,
    viewerUnavailable: viewer.isError && !userId,
  };
}

export const walletKey = (owner: string) =>
  ['mobile-api', owner, 'wallet'] as const;
export function useWallet(owner: string | undefined) {
  return useQuery({
    queryKey: walletKey(owner ?? ''),
    queryFn: ({ signal }) => mobileApi.wallet(owner!, signal),
    enabled: !!owner && !discoverPreview,
    retry: false,
    staleTime: 10_000,
  });
}
