import { useEffect, useSyncExternalStore } from 'react';
import { pendingStorage } from './pending';
import { historyNamespace } from '../cache/history-storage';
import {
  createHistoryIntentStore,
  type HistoryIntent,
} from './history-intents-core';
export const historyIntents = createHistoryIntentStore(
  pendingStorage,
  historyNamespace,
);
const empty: readonly HistoryIntent[] = [];
export function useHistoryIntents(owner?: string) {
  useEffect(() => {
    if (owner) void historyIntents.load(owner).catch(() => undefined);
  }, [owner]);
  return useSyncExternalStore(
    (notify) =>
      owner ? historyIntents.subscribe(owner, notify) : () => undefined,
    () => (owner ? historyIntents.getSnapshot(owner) : empty),
    () => empty,
  );
}
