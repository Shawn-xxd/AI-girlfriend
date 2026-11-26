import { prefetchCovers } from '../components/cover-prefetch';
import { preloadChat } from '../api/preload-chat';
import { useCharacterCatalog } from '../api/character-catalog';
import { blockingLoadError } from '../api/loading-policy';
import { useRef, useEffect } from 'react';
import {
  Image,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { discoverPreview, useMobileViewer } from '../api/queries';
import { mobileApi } from '../api/client';
import { previewCharacters } from '../discover/preview';
import { Portrait } from '../onboarding/Portrait';
import { DiscoverIcon } from '../discover/Icons';
import { openPreviewConversation } from '../chat/preview';
import { resumeHistoryActions } from '../chat/history-actions';
const back = () =>
  router.canGoBack() ? router.back() : router.replace('/(tabs)');
export function MatchScreen({ id }: { id: string }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { guest, viewer, userId, viewerUnavailable, catalogOwner } =
    useMobileViewer();
  const cache = useQueryClient();
  const lock = useRef(false);
  const characters = useCharacterCatalog(catalogOwner);
  const character = discoverPreview
    ? previewCharacters.find((item) => item.id === id)
    : userId
      ? characters.data?.characters.find((item) => item.id === id)
      : undefined;
  const cover = character?.coverUrl;
  useEffect(() => {
    void prefetchCovers([cover]);
  }, [cover]);
  const open = useMutation({
    mutationFn: async () => {
      await resumeHistoryActions(userId!, cache);
      return mobileApi.openConversation(userId!, id);
    },
    retry: false,
  });
  const failed =
    !discoverPreview &&
    (guest.status === 'error' ||
      viewerUnavailable ||
      blockingLoadError(characters.error, characters.data));
  const loading =
    !discoverPreview && !failed && (!userId || characters.isPending);
  function chat() {
    if (!character || lock.current || open.isPending) return;
    lock.current = true;
    if (discoverPreview) {
      openPreviewConversation(id);
      router.replace({ pathname: '/conversation/[id]', params: { id } });
      return;
    }
    if (!userId) {
      lock.current = false;
      return;
    }
    open.mutate(undefined, {
      onSuccess: (conversation) => {
        preloadChat(cache, userId, conversation.id, {
          ...conversation,
          character,
        });
        void cache.invalidateQueries({
          queryKey: ['mobile-api', userId, 'conversations'],
        });
        router.replace({
          pathname: '/conversation/[id]',
          params: { id: conversation.id },
        });
      },
      onError: () => {
        lock.current = false;
      },
    });
  }
  function retry() {
    if (guest.status !== 'ready') void guest.retry().catch(() => undefined);
    else {
      void viewer.refetch();
      void characters.refetch();
    }
  }
  const portrait =
    character && 'portraitIndex' in character
      ? character.portraitIndex
      : undefined;
  return (
    <SafeAreaView edges={['left', 'right']} style={s.screen}>
      {character?.coverUrl ? (
        <Image
          source={{ uri: character.coverUrl, cache: 'force-cache' }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        typeof portrait === 'number' && (
          <Portrait index={portrait} style={StyleSheet.absoluteFill} />
        )
      )}
      <LinearGradient
        pointerEvents="none"
        colors={['#00000016', 'transparent', '#00000038', '#000000c9']}
        locations={[0, 0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Discover"
        onPress={back}
        style={[s.back, { top: Math.max(insets.top, 24) + 18 }]}
      >
        <DiscoverIcon name="back" size={27} color="#ff0050" strokeWidth={2} />
      </Pressable>
      {discoverPreview && (
        <Text style={[s.preview, { top: Math.max(insets.top, 24) + 38 }]}>
          AI · PREVIEW
        </Text>
      )}
      {loading ? (
        <View style={s.state}>
          <ActivityIndicator
            color="#ff351c"
            accessibilityLabel="Loading match"
          />
        </View>
      ) : failed || !character ? (
        <View style={s.state}>
          <Text style={s.stateText}>
            {failed
              ? 'Unable to load this companion.'
              : 'This companion is unavailable.'}
          </Text>
          {failed && (
            <Pressable
              accessibilityRole="button"
              onPress={retry}
              style={s.retry}
            >
              <Text style={s.stateText}>Try again</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View
          style={[s.content, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <View style={[s.titleBlock, height < 700 && s.titleCompact]}>
            <Text
              accessibilityRole="header"
              style={[s.its, height < 700 && s.itsCompact]}
            >
              ITS A
            </Text>
            <Text style={[s.match, height < 700 && s.matchCompact]}>MATCH</Text>
          </View>
          {open.isError && (
            <Text accessibilityLiveRegion="polite" style={s.error}>
              Unable to open chat. Please try again.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chat now"
            disabled={open.isPending}
            onPress={chat}
            style={({ pressed }) => [s.cta, pressed && s.pressed]}
          >
            {open.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.ctaText}>CHAT NOW</Text>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    backgroundColor: '#201d1d',
  },
  back: {
    position: 'absolute',
    left: 8,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  preview: {
    position: 'absolute',
    right: 18,
    color: '#ffffffc9',
    fontSize: 8,
    letterSpacing: 1.2,
  },
  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 8 },
  titleBlock: { alignItems: 'center', marginBottom: 50 },
  titleCompact: { marginBottom: 30 },
  its: {
    fontFamily: 'Arial',
    fontSize: 58,
    lineHeight: 68,
    fontWeight: '900',
    color: '#fff',
  },
  itsCompact: { fontSize: 46, lineHeight: 54 },
  match: {
    fontFamily: 'Arial',
    fontSize: 60,
    lineHeight: 74,
    fontStyle: 'italic',
    fontWeight: '900',
    color: '#f20a57',
  },
  matchCompact: { fontSize: 50, lineHeight: 60 },
  cta: {
    height: 64,
    borderRadius: 13,
    backgroundColor: '#ff2808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontSize: 19, fontWeight: '900' },
  pressed: { opacity: 0.75 },
  state: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    gap: 16,
  },
  stateText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center' },
  error: {
    color: '#ffddd3',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 12,
  },
});
