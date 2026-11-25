import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useGuestSession } from '../auth';
import { guestSessionManager } from '../auth/client';
import { useOnboardingStore } from '../onboarding/store';
import { mobileApi } from '../api/client';
import { discoverPreview } from '../api/queries';
import {
  catalogQuery,
  conversationsQuery,
  viewerOwner,
  viewerQuery,
} from '../api/loading-policy';
import { prefetchCovers } from '../components/cover-prefetch';
import { STARTUP_MAX_WAIT_MS, startupPhase } from './policy';
import wordmark from '../../assets/images/startup-wordmark.png';

// Expo recommends holding the native screen at module scope, before routing starts.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 180, fade: true });

export function AppStartup({ children }: { children: ReactNode }) {
  const [finished, setFinished] = useState(false);
  const finish = useCallback(() => setFinished(true), []);
  // Keep navigation/Auth mounted underneath: hiding them would prevent preparation from completing.
  return (
    <View style={s.root}>
      {children}
      {!finished && <Preparation finish={finish} />}
    </View>
  );
}
function Preparation({ finish }: { finish: () => void }) {
  const hydrated = useOnboardingStore((state) => state.hydrated);
  const completed = useOnboardingStore((state) => state.completed);
  const guest = useGuestSession();
  const cache = useQueryClient();
  const segments = useSegments();
  const [laidOut, setLaidOut] = useState(false);
  const [wordmarkReady, setWordmarkReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [cover, setCover] = useState<{ key: string; loaded: boolean }>();
  const hidden = useRef(false);
  const owner = guest.status === 'ready' ? guest.owner : undefined;
  const enabled = hydrated && completed && !discoverPreview;
  const viewer = useQuery({
    ...viewerQuery(owner, mobileApi.viewer),
    enabled: enabled && !!owner,
  });
  const catalog = useQuery({
    ...catalogQuery(owner, mobileApi.characters),
    enabled: enabled && !!owner,
  });
  const viewerReady = !!viewerOwner(guest, viewer.data, viewer.error);
  // The same query keys are used by Discover/Chats, so no second request chain is introduced.
  useEffect(() => {
    if (enabled && viewerReady && owner)
      void cache.prefetchQuery(
        conversationsQuery(owner, mobileApi.conversations),
      );
  }, [cache, enabled, viewerReady, owner]);
  const firstCover = catalog.data?.characters[0]?.coverUrl;
  const coverKey = `${owner ?? ''}|${firstCover ?? ''}|${attempt}`;
  const coverReady = !firstCover || (cover?.key === coverKey && cover.loaded);
  const coverFailed = cover?.key === coverKey && !cover.loaded;
  useEffect(() => {
    if (!enabled || !owner || !firstCover) return;
    let current = true;
    // Reuse the existing public-cover/native Image cache and in-flight prefetch.
    void prefetchCovers([firstCover]).then((loaded) => {
      if (current) setCover({ key: coverKey, loaded });
    });
    return () => {
      current = false;
    };
  }, [enabled, owner, firstCover, coverKey]);
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), STARTUP_MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [attempt]);
  const firstSegment = segments[0];
  const destinationReady =
    !!firstSegment &&
    firstSegment !== 'index' &&
    (!completed || discoverPreview || firstSegment !== 'onboarding');
  const preparation = {
    hydrated,
    completed,
    preview: discoverPreview,
    destinationReady,
    guest,
    viewer: viewer.data,
    viewerError: viewer.error,
    viewerFetching: viewer.isFetching,
    catalog: catalog.data,
    catalogError: catalog.error,
    catalogFetching: catalog.isFetching,
    coverReady,
    coverFailed,
    expired,
  };
  const phase = startupPhase(preparation);
  useEffect(() => {
    if (!laidOut || !wordmarkReady) return;
    const frame = requestAnimationFrame(() => {
      if (!hidden.current) {
        // Hand off the static native screen to its matching React cover so progress is visible.
        SplashScreen.hide();
        hidden.current = true;
      }
      if (phase === 'ready') {
        // Observer-free warming continues after the preparation overlay unmounts.
        if (enabled && owner)
          void cache
            .fetchQuery(conversationsQuery(owner, mobileApi.conversations))
            .then((data) => {
              const current = guestSessionManager.getSnapshot();
              if (current.status === 'ready' && current.owner === owner)
                return prefetchCovers(
                  data.conversations
                    .slice(0, 3)
                    .map((row) => row.character.coverUrl),
                );
            })
            .catch(() => undefined);
        finish();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [laidOut, wordmarkReady, phase, finish, cache, enabled, owner]);
  function retry() {
    setExpired(false);
    setAttempt((value) => value + 1);
    if (guest.status === 'error') void guest.retry().catch(() => undefined);
    else if (owner) {
      void viewer.refetch({ cancelRefetch: false });
      void catalog.refetch({ cancelRefetch: false });
    }
  }
  return (
    <View
      style={s.cover}
      onLayout={() => setLaidOut(true)}
      accessibilityViewIsModal
    >
      <Image
        source={wordmark}
        style={s.mark}
        accessibilityLabel="Tempta"
        onLoadEnd={() => setWordmarkReady(true)}
      />
      {phase === 'error' ? (
        <View style={s.feedback}>
          <Text style={s.message} accessibilityRole="alert">
            Unable to load. Please try again.
          </Text>
          <Pressable
            onPress={retry}
            style={s.retry}
            accessibilityRole="button"
            accessibilityLabel="Retry loading app"
          >
            <Text style={s.retryText}>Try again</Text>
          </Pressable>
          <Pressable
            onPress={finish}
            style={s.continueButton}
            accessibilityRole="button"
            accessibilityLabel="Continue to app"
          >
            <Text style={s.continueText}>Continue</Text>
          </Pressable>
        </View>
      ) : (
        <StartupLoadingBar />
      )}
    </View>
  );
}
function StartupLoadingBar() {
  const position = useSharedValue(-56);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!reducedMotion)
      position.value = withRepeat(
        withTiming(160, { duration: 1100, easing: Easing.linear }),
        -1,
      );
    return () => cancelAnimation(position);
  }, [position, reducedMotion]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: reducedMotion ? 52 : position.value }],
  }));
  return (
    <View
      style={s.progress}
      accessibilityRole="progressbar"
      accessibilityLabel="Preparing app"
      accessibilityState={{ busy: true }}
    >
      <Animated.View style={[s.progressFill, style]} />
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111112' },
  cover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#111112',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  mark: { width: 180, height: 56.25 },
  progress: {
    position: 'absolute',
    top: '59%',
    width: 160,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: '#ffffff1a',
  },
  progressFill: {
    width: 56,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#f3321a',
  },
  feedback: {
    position: 'absolute',
    top: '59%',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 24,
  },
  message: { color: '#b8b6b6', fontSize: 14, textAlign: 'center' },
  retry: {
    minHeight: 44,
    minWidth: 160,
    borderRadius: 24,
    backgroundColor: '#f3321a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  continueButton: {
    minHeight: 44,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  continueText: { color: '#b8b6b6', fontSize: 14 },
});
