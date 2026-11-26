import {
  detailQuery,
  timelineQuery,
  blockingLoadError,
  type CachedTimelinePage,
} from '../api/loading-policy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import type { ChatStatus, TimelineEntry } from '@companion/shared';
import { mobileApi } from '../api/client';
import { useCharacterCatalog } from '../api/character-catalog';
import { characterCover, characterAvatarFocus } from '../api/character-cover';
import { MobileApiError } from '../api/core';
import { useMobileViewer, useWallet } from '../api/queries';
import { ChatScreen } from './ChatScreen';
import { pendingStore } from './pending';
import type { PendingMessage } from './pending-core';
import type { ChatRow } from './preview';
import { generationIsPending } from './history';
import { PhotoCard } from '../gallery/PhotoCard';
import { historyIntents, useHistoryIntents } from './history-intents';
import { resumeHistoryActions } from './history-actions';
import { isForgottenConversation } from '../cache/history-core';
const back = () =>
  router.canGoBack() ? router.back() : router.replace('/(tabs)');
export function LiveConversation({ id }: { id: string }) {
  const cache = useQueryClient();
  const { guest, viewer, userId, viewerUnavailable } = useMobileViewer();
  const intents = useHistoryIntents(userId);
  const retry = () => {
    if (guest.status !== 'ready') void guest.retry().catch(() => undefined);
    else void viewer.refetch();
  };
  if (!userId)
    return (
      <ChatScreen
        rows={[]}
        text=""
        onText={() => undefined}
        onSend={() => undefined}
        onBack={back}
        loading={guest.status !== 'error' && !viewerUnavailable}
        unavailable={guest.status === 'error' || viewerUnavailable}
        onRetry={retry}
      />
    );
  if (
    intents.some((item) => item.conversationId === id) ||
    isForgottenConversation(cache, userId, id)
  )
    return (
      <ChatScreen
        rows={[]}
        text=""
        onText={() => undefined}
        onSend={() => undefined}
        onBack={back}
        unavailable
        error="This chat has been cleared or is being removed."
        onRetry={() => {
          void resumeHistoryActions(userId, cache)
            .then(() => {
              router.dismissAll();
              router.replace('/(tabs)/chats');
            })
            .catch(() => undefined);
        }}
      />
    );
  return <ReadyConversation key={`${userId}.${id}`} owner={userId} id={id} />;
}
function ReadyConversation({ owner, id }: { owner: string; id: string }) {
  const cache = useQueryClient();
  const wallet = useWallet(owner);
  const catalog = useCharacterCatalog(owner);
  const active = useRef(true);
  const lock = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const [text, setText] = useState('');
  const draftEdited = useRef(false);
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const [delivered, setDelivered] = useState<TimelineEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [revealReplyId, setRevealReplyId] = useState<string | null>(null);
  const completeReveal = useCallback((id: string) => {
    setRevealReplyId((current) => (current === id ? null : current));
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftFailed, setDraftFailed] = useState(false);
  const detail = useQuery(detailQuery(owner, id, mobileApi.conversation));
  const messages = useInfiniteQuery({
    ...timelineQuery(owner, id, mobileApi.timeline),
    refetchInterval: (query) =>
      query.state.data?.pages[0]?.entries.some(
        (message) => message.kind === 'text' && generationIsPending(message),
      )
        ? 4000
        : false,
  });
  const storedRows = useMemo(() => {
    const byId = new Map<string, TimelineEntry>();
    [...(messages.data?.pages ?? [])]
      .reverse()
      .flatMap((page) => page.entries)
      .forEach((message) => byId.set(message.id, message));
    delivered.forEach((message) => byId.set(message.id, message));
    return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
  }, [messages.data, delivered]);
  async function restore() {
    setDraftReady(false);
    setDraftFailed(false);
    setError(null);
    try {
      const saved = await pendingStore.load(owner, id);
      if (active.current) {
        draftEdited.current = false;
        setPending(saved);
        setText(saved?.text ?? '');
        setDraftReady(true);
      }
    } catch {
      if (active.current) {
        setDraftFailed(true);
        setError('Unable to restore your draft. Please try again.');
      }
    }
  }
  useEffect(() => {
    active.current = true;
    void restore();
    return () => {
      active.current = false;
      abort.current?.abort();
    };
  }, [owner, id]);
  useEffect(() => {
    if (
      !pending ||
      busy ||
      !storedRows.some(
        (row) =>
          row.kind === 'text' &&
          row.requestKey === pending.requestKey &&
          row.state === 'completed',
      )
    )
      return;
    const key = pending.requestKey;
    void pendingStore
      .clear(owner, id, key)
      .then(() => {
        if (active.current) {
          setError(null);
          setText((current) =>
            !draftEdited.current && current.trim() === pending.text
              ? ''
              : current,
          );
          setPending((current) =>
            current?.requestKey === key ? null : current,
          );
        }
      })
      .catch(() => {
        if (active.current)
          setError('Unable to update your draft. Please try again.');
      });
  }, [storedRows, pending, busy, owner, id]);
  const pendingOnServer = storedRows.some(
    (row) => row.kind === 'text' && generationIsPending(row),
  );
  const unavailable =
    blockingLoadError(detail.error, detail.data) ||
    blockingLoadError(messages.error, messages.data) ||
    draftFailed;
  const loading = detail.isPending || messages.isPending;
  async function submit() {
    if (
      lock.current ||
      busy ||
      pendingOnServer ||
      !draftReady ||
      loading ||
      unavailable ||
      !text.trim() ||
      text.trim().length > 4000
    )
      return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setStatus('checking');
    setRevealReplyId(null);
    const body = text.trim();
    // Keep the focused input editable for the next draft, including during storage/network waits.
    draftEdited.current = false;
    setText('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const request = await pendingStore.prepare(owner, id, body, randomUUID);
      if (!active.current || controller.signal.aborted) return;
      setPending(request);
      const reply = await mobileApi.stream(
        owner,
        id,
        request,
        (next) => {
          if (active.current) setStatus(next);
        },
        controller.signal,
      );
      if (
        !active.current ||
        controller.signal.aborted ||
        historyIntents
          .getSnapshot(owner)
          .some((item) => item.conversationId === id)
      )
        return;
      if (active.current) {
        const assistant = reply.messages.find(
          (message) => message.role === 'assistant',
        );
        const latest = cache.getQueryData<InfiniteData<CachedTimelinePage>>([
          'mobile-api',
          owner,
          'timeline',
          id,
        ]);
        const alreadyVisible =
          assistant &&
          (storedRows.some((row) => row.id === assistant.id) ||
            latest?.pages.some((page) =>
              page.entries.some((row) => row.id === assistant.id),
            ));
        setRevealReplyId(assistant && !alreadyVisible ? assistant.id : null);
        // The network reply is complete; storage cleanup must not show another typing bubble.
        setStatus(null);
      }
      // The response is fully persisted/validated by the server. Cache it immediately,
      // before the slower history refresh, so a cold restart can restore this reply.
      cache.setQueryData<InfiniteData<CachedTimelinePage>>(
        ['mobile-api', owner, 'timeline', id],
        (previous) => {
          if (!previous?.pages[0]) return previous;
          const entries = new Map(
            previous.pages[0].entries.map((entry) => [entry.id, entry]),
          );
          reply.messages.forEach((message) =>
            entries.set(message.id, { ...message, kind: 'text' }),
          );
          return {
            ...previous,
            pages: [
              {
                ...previous.pages[0],
                entries: [...entries.values()].sort(
                  (a, b) => a.sequence - b.sequence,
                ),
              },
              ...previous.pages.slice(1),
            ],
          };
        },
      );
      if (active.current) {
        setDelivered((rows) =>
          [
            ...rows,
            ...reply.messages.map((message) => ({
              ...message,
              kind: 'text' as const,
            })),
          ].slice(-100),
        );
        setPending(null);
      }
      await pendingStore.clear(owner, id, request.requestKey);
      void cache.invalidateQueries({
        queryKey: ['mobile-api', owner, 'conversations'],
      });
      void cache.invalidateQueries({
        queryKey: ['mobile-api', owner, 'gallery', id],
      });
    } catch (failure) {
      if (active.current) {
        setText((current) => current || body);
        setError(
          failure instanceof MobileApiError
            ? failure.message
            : 'Unable to send. Please try again.',
        );
      }
    } finally {
      void cache.invalidateQueries({
        queryKey: ['mobile-api', owner, 'timeline', id],
      });
      if (active.current) {
        setBusy(false);
        setStatus(null);
      }
      lock.current = false;
    }
  }
  async function retryRow(row: ChatRow) {
    if (lock.current || pendingOnServer || !row.requestKey) return;
    lock.current = true;
    try {
      const draft = { requestKey: row.requestKey, text: row.content };
      await pendingStore.remember(owner, id, draft);
      if (active.current) {
        draftEdited.current = false;
        setPending(draft);
        setText(row.content);
        setError(null);
      }
    } catch {
      if (active.current)
        setError('Unable to prepare your message. Please try again.');
    } finally {
      lock.current = false;
    }
  }
  const rows: ChatRow[] = storedRows.map((row) =>
    row.kind === 'photo'
      ? {
          id: row.id,
          kind: 'photo',
          role: 'assistant',
          content: row.photo.title,
          photo: row.photo,
        }
      : {
          ...row,
          expired: row.state === 'pending' && !generationIsPending(row),
        },
  );
  if (detail.data?.greetingMessage && !messages.hasNextPage)
    rows.unshift({
      id: `greeting.${id}`,
      role: 'assistant',
      content: detail.data.greetingMessage,
    });
  if (
    busy &&
    pending &&
    !rows.some((row) => row.requestKey === pending.requestKey)
  )
    rows.push({
      id: 'local-pending',
      role: 'user',
      content: pending.text,
      state: 'pending',
      requestKey: pending.requestKey,
    });
  return (
    <ChatScreen
      character={
        detail.data
          ? {
              ...detail.data.character,
              avatarFocusY: characterAvatarFocus(
                detail.data.character,
                catalog.data?.characters,
              ),
              coverUrl: characterCover(
                detail.data.character,
                catalog.data?.characters,
              ),
            }
          : undefined
      }
      level={messages.data?.pages[0]?.progress.level}
      progress={messages.data?.pages[0]?.progress}
      balance={wallet.data?.availableDiamonds}
      renderPhoto={(row) =>
        row.photo ? (
          <PhotoCard owner={owner} conversation={id} photo={row.photo} />
        ) : null
      }
      onGallery={
        detail.data
          ? () => router.push({ pathname: '/gallery/[id]', params: { id } })
          : undefined
      }
      onCharacter={
        detail.data
          ? () =>
              router.navigate({ pathname: '/character/[id]', params: { id } })
          : undefined
      }
      rows={rows}
      text={text}
      onText={(value) => {
        draftEdited.current = true;
        setText(value);
      }}
      onSend={() => void submit()}
      onBack={back}
      inputDisabled={!draftReady}
      busy={busy || pendingOnServer}
      typing={(busy && status !== null) || pendingOnServer}
      revealReplyId={revealReplyId}
      onRevealComplete={completeReveal}
      error={
        error ??
        (messages.isError || detail.isError
          ? 'Unable to refresh messages. Please try again.'
          : null)
      }
      unavailable={unavailable}
      loading={loading}
      onRetry={() => {
        void restore();
        void detail.refetch();
        void messages.refetch();
      }}
      onRetryRow={(row) => void retryRow(row)}
      onEarlier={
        messages.hasNextPage
          ? () => void messages.fetchNextPage({ cancelRefetch: false })
          : undefined
      }
      loadingEarlier={messages.isFetching}
      earlierError={messages.isFetchNextPageError}
    />
  );
}
