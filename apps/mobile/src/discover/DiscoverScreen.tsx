import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  AccessibilityInfo,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { Portrait } from '../onboarding/Portrait';
import { DiamondButton } from '../components/DiamondButton';
import { mobileApi } from '../api/client';
import { discoverPreview, useMobileViewer } from '../api/queries';
import {
  remainingCharacters,
  swipeIntent,
  type DiscoverCharacter,
} from './model';
import { previewCharacters } from './preview';
import { DiscoverIcon } from './Icons';
import { styles } from './styles';

export default function DiscoverScreen() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height < 700;
  const { guest, viewer, userId } = useMobileViewer();
  const characters = useQuery({
    queryKey: ['mobile-api', userId, 'characters'],
    queryFn: ({ signal }) => mobileApi.characters(userId!, signal),
    enabled: !!userId && !discoverPreview,
    retry: false,
  });
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [sheet, setSheet] = useState<
    'diamonds' | 'premium' | 'character' | null
  >(null);
  const [moving, setMoving] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const position = useRef(new Animated.ValueXY()).current;
  const selectionLock = useRef(false);
  const motionLock = useRef(false);
  const previousOwner = useRef(userId);
  useFocusEffect(
    useCallback(() => {
      selectionLock.current = false;
    }, []),
  );
  const items: DiscoverCharacter[] = discoverPreview
    ? previewCharacters
    : (characters.data?.characters ?? []);
  const remaining = remainingCharacters(items, dismissed);
  const current = remaining[0];
  const pending = moving;
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (userId && previousOwner.current && previousOwner.current !== userId) {
      setDismissed([]);
      setSheet(null);
    }
    if (userId) previousOwner.current = userId;
  }, [userId]);

  function choose() {
    if (!current || selectionLock.current || motionLock.current) return;
    if (!discoverPreview && !userId) return;
    selectionLock.current = true;
    setSheet(null);
    router.push({ pathname: '/match/[id]', params: { id: current.id } });
  }
  function swipe(direction: 'skip' | 'select') {
    if (!current || pending || selectionLock.current || motionLock.current)
      return;
    motionLock.current = true;
    setMoving(true);
    Animated.timing(position, {
      toValue: { x: direction === 'skip' ? -width : width, y: 0 },
      duration: reduceMotion ? 0 : 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      position.setValue({ x: 0, y: 0 });
      setMoving(false);
      motionLock.current = false;
      if (!finished) return;
      if (direction === 'skip') {
        setSheet(null);
        setDismissed((ids) =>
          ids.includes(current.id) ? ids : [...ids, current.id],
        );
      } else choose();
    });
  }
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !pending &&
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderMove: (_, gesture) => {
          if (!pending)
            position.setValue({ x: gesture.dx, y: gesture.dy * 0.08 });
        },
        onPanResponderRelease: (_, gesture) => {
          const intent = swipeIntent(
            gesture.dx,
            gesture.dy,
            gesture.vx,
            Math.min(width, 500),
          );
          if (intent !== 'cancel') swipe(intent);
          else
            Animated.spring(position, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: true,
              bounciness: 3,
            }).start();
        },
        onPanResponderTerminate: () => position.setValue({ x: 0, y: 0 }),
        onPanResponderTerminationRequest: () => true,
        // Gesture handlers must use the currently displayed card and request state.
      }),
    [current?.id, pending, width, reduceMotion, userId],
  );
  const rotate = position.x.interpolate({
    inputRange: [-400, 0, 400],
    outputRange: ['-9deg', '0deg', '9deg'],
    extrapolate: 'clamp',
  });
  const authError = !discoverPreview && guest.status === 'error';
  const dataError = !discoverPreview && (viewer.isError || characters.isError);
  const loading =
    !discoverPreview &&
    !authError &&
    !dataError &&
    (!userId || characters.isPending);
  const unavailable = authError || dataError;
  async function retry() {
    try {
      if (guest.status !== 'ready') await guest.retry();
      else {
        await viewer.refetch();
        if (userId) await characters.refetch();
      }
    } catch {
      /* Render sanitized state and allow another explicit retry. */
    }
  }
  return (
    <SafeAreaView edges={['left', 'right']} style={styles.screen}>
      <View style={styles.body}>
        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator
              color="#ff3215"
              accessibilityLabel="Loading characters"
            />
          </View>
        ) : unavailable ? (
          <View style={styles.state}>
            <DiscoverIcon name="info" color="#8c8588" size={34} />
            <Text style={styles.stateTitle}>Let’s try that again.</Text>
            <Text style={styles.stateText}>Unable to connect right now.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void retry()}
              style={styles.stateButton}
            >
              <Text style={styles.stateButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : !current ? (
          <View style={styles.state}>
            <DiscoverIcon name="heart" size={34} color="#a09a98" />
            <Text style={styles.stateTitle}>
              {items.length
                ? 'You’re all caught up.'
                : 'No companions just yet.'}
            </Text>
            {items.length > 0 && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setDismissed([])}
                style={styles.stateButton}
              >
                <Text style={styles.stateButtonText}>View again</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Animated.View
            {...responder.panHandlers}
            style={[
              styles.card,
              { transform: [...position.getTranslateTransform(), { rotate }] },
            ]}
          >
            {current.portraitIndex !== undefined ? (
              <Portrait
                index={current.portraitIndex}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <View style={styles.coverPlaceholder}>
                <DiscoverIcon name="heart" color="#4e4547" size={70} />
              </View>
            )}
            <LinearGradient
              pointerEvents="none"
              colors={[
                '#00000038',
                'transparent',
                '#00000008',
                '#000000d9',
                '#000000',
              ]}
              locations={[0, 0.25, 0.48, 0.78, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[styles.cardBottom, compact && styles.cardBottomCompact]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`About ${current.name}`}
                disabled={pending}
                onPress={() => setSheet('character')}
                style={({ pressed }) => [
                  styles.nameRow,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  accessibilityRole="header"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                  style={[styles.name, compact && styles.nameCompact]}
                >
                  {current.name}
                </Text>
                <View style={styles.archetypeBadge}>
                  <Text numberOfLines={1} style={styles.archetype}>
                    {current.archetype}
                  </Text>
                </View>
              </Pressable>
              <Text
                numberOfLines={compact ? 2 : 3}
                style={[styles.bio, compact && styles.bioCompact]}
              >
                {current.bio}
              </Text>
              <View style={styles.tags}>
                {[...new Set(current.tags)].slice(0, 3).map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text numberOfLines={1} style={styles.tagText}>
                      #{tag.replace(/^#+/, '')}
                    </Text>
                  </View>
                ))}
              </View>
              <View
                style={[styles.controls, compact && styles.controlsCompact]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Skip ${current.name}`}
                  disabled={pending}
                  onPress={() => swipe('skip')}
                  style={({ pressed }) => [
                    styles.skip,
                    compact && styles.controlCompact,
                    pressed && styles.pressed,
                    pending && styles.disabled,
                  ]}
                >
                  <DiscoverIcon
                    name="close"
                    size={compact ? 39 : 47}
                    color="#dd1105"
                    strokeWidth={4.6}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${current.name}`}
                  disabled={pending}
                  onPress={choose}
                  style={({ pressed }) => [
                    styles.heart,
                    compact && styles.controlCompact,
                    pressed && styles.pressed,
                    pending && styles.disabled,
                  ]}
                >
                  <DiscoverIcon
                    name="heart"
                    size={compact ? 43 : 55}
                    strokeWidth={0}
                  />
                </Pressable>
              </View>
            </View>
          </Animated.View>
        )}
        <View
          pointerEvents="box-none"
          style={[
            styles.header,
            { top: Math.max(insets.top, compact ? 16 : 40) + 12 },
          ]}
        >
          <View pointerEvents="none" style={styles.identity}>
            <Text style={styles.identityText}>
              {discoverPreview ? 'AI · PREVIEW' : 'AI COMPANION'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <DiamondButton onPress={() => setSheet('diamonds')} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View Premium"
              onPress={() => setSheet('premium')}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.pressed,
              ]}
            >
              <View pointerEvents="none" style={styles.premium}>
                <LinearGradient
                  colors={['#fff142', '#ffb01a']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.premiumGlyph}>
                  <DiscoverIcon name="crown" size={21} color="#171710" filled />
                </View>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
      <Modal
        transparent
        visible={sheet !== null}
        animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={() => {
          setSheet(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>
                {sheet === 'character'
                  ? current?.name
                  : sheet === 'premium'
                    ? 'Premium'
                    : 'Diamonds'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close details"
                onPress={() => {
                  setSheet(null);
                }}
                style={styles.sheetClose}
              >
                <DiscoverIcon name="close" size={20} />
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll}>
              <Text style={styles.sheetBody}>
                {sheet === 'character'
                  ? current?.bio
                  : sheet === 'premium'
                    ? 'More room to chat. More moments together.'
                    : 'Diamonds let you unlock character photos.'}
              </Text>
              {sheet === 'character' && (
                <View style={styles.tags}>
                  {[...new Set(current?.tags)].map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
              {sheet === 'character' && discoverPreview && (
                <Text style={styles.previewNote}>
                  Character preview. Live conversations are not available in
                  this preview.
                </Text>
              )}
            </ScrollView>
            {sheet === 'character' && !discoverPreview && (
              <Pressable
                accessibilityRole="button"
                onPress={choose}
                style={styles.sheetButton}
              >
                <Text style={styles.sheetButtonText}>Continue</Text>
              </Pressable>
            )}
            {sheet !== 'character' && (
              <Text style={styles.previewNote}>
                Purchases are currently unavailable.
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
