import type { QueryClient } from '@tanstack/react-query';
import { mobileApi } from '../api/client';
import { historyIntents } from './history-intents';
import type { HistoryIntent } from './history-intents-core';
import { pendingStore } from './pending';
import {
  forgetCachedConversation,
  historyCacheKey,
} from '../cache/history-core';
import { historyStorage, historyNamespace } from '../cache/history-storage';
import { MobileApiError } from '../api/core';
const running = new Map<
  string,
  Promise<Awaited<ReturnType<typeof mobileApi.changeHistory>>>
>();
export function finishHistoryAction(
  owner: string,
  intent: HistoryIntent,
  cache: QueryClient,
) {
  const key = `${owner}.${intent.requestKey}`;
  const known = running.get(key);
  if (known) return known;
  const task = (async () => {
    const purge = async () => {
      await cache.cancelQueries({ queryKey: ['mobile-api', owner] });
      cache.removeQueries({
        predicate: (query) =>
          query.queryKey[0] === 'mobile-api' &&
          query.queryKey[1] === owner &&
          query.queryKey[3] === intent.conversationId,
      });
      cache.setQueryData<{ conversations: { id: string }[] }>(
        ['mobile-api', owner, 'conversations'],
        (old) =>
          old
            ? {
                conversations: old.conversations.filter(
                  (row) => row.id !== intent.conversationId,
                ),
              }
            : undefined,
      );
      if (
        !(await forgetCachedConversation(cache, owner, intent.conversationId))
      )
        await historyStorage.removeItem(
          historyCacheKey(historyNamespace, owner),
        );
      await pendingStore.discard(owner, intent.conversationId);
    };
    await purge();
    let result;
    try {
      result = await mobileApi.changeHistory(owner, intent.conversationId, {
        action: intent.action,
        requestKey: intent.requestKey,
      });
    } catch (error) {
      if (!(error instanceof MobileApiError) || error.code !== 'not_found')
        throw error;
      // A missing endpoint during rollback is not proof that this chat was removed.
      try {
        await mobileApi.conversation(owner, intent.conversationId);
        throw error;
      } catch (detailError) {
        if (
          !(detailError instanceof MobileApiError) ||
          detailError.code !== 'not_found' ||
          detailError === error
        )
          throw error;
      }
      result = { action: intent.action, conversationId: null };
    }
    await purge();
    await historyIntents.finish(owner, intent.requestKey);
    void cache.invalidateQueries({
      queryKey: ['mobile-api', owner, 'conversations'],
    });
    return result;
  })();
  running.set(key, task);
  void task
    .finally(() => {
      if (running.get(key) === task) running.delete(key);
    })
    .catch(() => undefined);
  return task;
}
export async function resumeHistoryActions(owner: string, cache: QueryClient) {
  for (const intent of await historyIntents.load(owner))
    await finishHistoryAction(owner, intent, cache);
}
