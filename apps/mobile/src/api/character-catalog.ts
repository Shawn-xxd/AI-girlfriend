import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { mobileApi } from './client';
import { discoverPreview } from './queries';

// Reuse Discover's owner-scoped cache; fetching covers must not refresh viewer or reset chat drafts.
export function useCharacterCatalog(owner: string | undefined) {
  const query = useQuery({
    queryKey: ['mobile-api', owner, 'characters'],
    queryFn: ({ signal }) => mobileApi.characters(owner!, signal),
    enabled: !!owner && !discoverPreview,
    staleTime: 30_000,
    refetchOnMount: true,
    retry: false,
  });
  useFocusEffect(
    useCallback(() => {
      if (
        owner &&
        !discoverPreview &&
        Date.now() - query.dataUpdatedAt > 30_000
      )
        void query.refetch({ cancelRefetch: false });
    }, [owner, query.refetch, query.dataUpdatedAt]),
  );
  return query;
}
