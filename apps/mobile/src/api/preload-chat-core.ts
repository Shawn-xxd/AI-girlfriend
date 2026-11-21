import type { QueryClient } from '@tanstack/react-query';
import type {
  ConversationDetail,
  ConversationSummary,
} from '@companion/shared';
import {
  detailQuery,
  timelineQuery,
  conversationsQuery,
} from './loading-policy';
type Loaders = {
  conversation: Parameters<typeof detailQuery>[2];
  timeline: Parameters<typeof timelineQuery>[2];
  conversations: Parameters<typeof conversationsQuery>[1];
};
export function createChatPreloader(api: Loaders) {
  return (
    cache: QueryClient,
    owner: string,
    id: string,
    seed?: ConversationDetail,
  ) => {
    const detail = detailQuery(owner, id, api.conversation);
    if (!cache.getQueryData(detail.queryKey)) {
      const list = cache.getQueryData<{ conversations: ConversationSummary[] }>(
        conversationsQuery(owner, api.conversations).queryKey,
      );
      const known = list?.conversations.find((row) => row.id === id) ?? seed;
      if (known && known.id === id && known.character.id === known.characterId)
        cache.setQueryData(detail.queryKey, known, { updatedAt: 0 });
    }
    return Promise.all([
      cache.prefetchQuery(detail),
      cache.prefetchInfiniteQuery({
        ...timelineQuery(owner, id, api.timeline),
        pages: 1,
      }),
    ]);
  };
}
