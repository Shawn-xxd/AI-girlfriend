import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from './client';
import { discoverPreview } from './queries';
import { catalogQuery } from './loading-policy';
// fetchQuery shares in-flight requests and respects the freshness window on focus.
export function useCharacterCatalog(owner: string | undefined) {
  const cache = useQueryClient();
  const options = catalogQuery(owner, mobileApi.characters);
  const query = useQuery({ ...options, enabled: !!owner && !discoverPreview });
  useFocusEffect(
    useCallback(() => {
      if (owner && !discoverPreview)
        void cache
          .fetchQuery(catalogQuery(owner, mobileApi.characters))
          .catch(() => undefined);
    }, [cache, owner]),
  );
  return query;
}
