import {
  detailQuery,
  timelineQuery,
  blockingLoadError,
  type CachedTimelinePage,
} from '../api/loading-policy';
import { useEffect, useMemo, useRef, useState } from 'react';
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
const back = () =>
  router.canGoBack() ? router.back() : router.replace('/(tabs)');
export function LiveConversation({ id }: { id: string }) {
  const { guest, viewer, userId, viewerUnavailable } = useMobileViewer();
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
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const [delivered, setDelivered] = useState<TimelineEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ChatStatus | null>(null);
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
            current.trim() === pending.text ? '' : current,
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
    const body = text.trim();
    const controller = new AbortController();
    abort.current = controller;
    try {
      const request = await pendingStore.prepare(owner, id, body, randomUUID);
      if (!active.current || controller.signal.aborted) return;
      setPending(request);
      setText('');
      const reply = await mobileApi.stream(
        owner,
        id,
        request,
        (next) => {
          if (active.current) setStatus(next);
        },
        controller.signal,
      );
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
        setText(body);
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
      rows={rows}
      text={text}
      onText={setText}
      onSend={() => void submit()}
      onBack={back}
      inputDisabled={!draftReady}
      busy={busy || pendingOnServer}
      status={status}
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
