import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  KeyboardChatScrollView,
  KeyboardStickyView,
  type KeyboardChatScrollViewRef,
} from 'react-native-keyboard-controller';
import type { Character } from '@companion/shared';
import { DiscoverIcon } from '../discover/Icons';
import { CharacterHeader } from './CharacterHeader';
import { Portrait } from '../onboarding/Portrait';
import type { ChatRow } from './preview';
import { chatStyles as s } from './styles';
import { TypingIndicator } from './TypingIndicator';
import { ReplyText } from './ReplyText';
interface Props {
  character?: Character & { portraitIndex?: number };
  rows: ChatRow[];
  preview?: boolean;
  loading?: boolean;
  unavailable?: boolean;
  text: string;
  onText: (text: string) => void;
  onSend: () => void;
  onBack: () => void;
  onGallery?: () => void;
  openedPhotoIds?: readonly string[];
  onOpenPhoto?: (id: string) => void;
  renderPhoto?: (row: ChatRow) => ReactNode;
  level?: number;
  balance?: number;
  busy?: boolean;
  inputDisabled?: boolean;
  typing?: boolean;
  revealReplyId?: string | null;
  onRevealComplete?: (id: string) => void;
  error?: string | null;
  onRetry?: () => void;
  onRetryRow?: (row: ChatRow) => void;
  onEarlier?: () => void;
  loadingEarlier?: boolean;
  earlierError?: boolean;
}
export function ChatScreen({
  character,
  rows,
  preview = false,
  loading = false,
  unavailable = false,
  text,
  onText,
  onSend,
  onBack,
  onGallery,
  openedPhotoIds = [],
  onOpenPhoto,
  renderPhoto,
  level,
  balance,
  busy = false,
  inputDisabled = false,
  typing = busy,
  revealReplyId,
  onRevealComplete,
  error,
  onRetry,
  onRetryRow,
  onEarlier,
  loadingEarlier = false,
  earlierError = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = width < 360 || height < 700;
  const [sheet, setSheet] = useState<'diamonds' | 'character' | null>(null);
  const keyboardOffset = Math.max(insets.bottom, 10) - 8;
  const [inputHeight, setInputHeight] = useState(48);
  useEffect(() => {
    if (!text) setInputHeight(48);
  }, [text]);
  const scroll = useRef<KeyboardChatScrollViewRef>(null);
  const metrics = useRef({
    height: 0,
    offset: 0,
    nearBottom: !preview,
    prepend: false,
    positioned: false,
  });
  useEffect(() => {
    if (earlierError) metrics.current.prepend = false;
  }, [earlierError]);
  function showLatest() {
    // Focusing the composer deliberately leaves history browsing, including a pending prepend.
    metrics.current.nearBottom = true;
    metrics.current.prepend = false;
    scroll.current?.scrollToEnd({ animated: false });
  }
  const name = character?.name ?? 'AI companion';
  const portrait = character?.portraitIndex;
  function scrollSize(_: number, height: number) {
    if (metrics.current.prepend) {
      const offset = metrics.current.offset + height - metrics.current.height;
      scroll.current?.scrollTo({ y: Math.max(0, offset), animated: false });
      metrics.current.prepend = false;
    } else if (
      metrics.current.nearBottom ||
      (!metrics.current.positioned && !preview)
    )
      scroll.current?.scrollToEnd({ animated: false });
    metrics.current.positioned = true;
    metrics.current.height = height;
  }
  const chooseEarlier = () => {
    metrics.current.prepend = true;
    onEarlier?.();
  };
  return (
    <SafeAreaView edges={['left', 'right']} style={s.screen}>
      <View pointerEvents="none" style={s.backdrop}>
        {character?.coverUrl ? (
          <Image
            source={{ uri: character.coverUrl, cache: 'force-cache' }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          portrait !== undefined && (
            <Portrait index={portrait} style={StyleSheet.absoluteFill} />
          )
        )}
        <LinearGradient
          colors={['#000000f5', '#0000002b', '#00000026', '#000000f9']}
          locations={[0, 0.2, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View style={s.flex}>
        <CharacterHeader
          character={character}
          preview={preview}
          level={level}
          balance={balance}
          onBack={onBack}
          onCharacter={() => setSheet('character')}
          onDiamonds={() =>
            router.push({
              pathname: '/premium',
              params: { section: 'diamonds' },
            })
          }
          onAction={
            onGallery
              ? () => {
                  Keyboard.dismiss();
                  onGallery();
                }
              : undefined
          }
        />
        {unavailable ? (
          <View style={s.state}>
            <Text style={s.stateText}>Unable to load this conversation.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onRetry}
              style={s.retry}
            >
              <Text style={s.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : loading ? (
          <View style={s.state}>
            <ActivityIndicator
              color="#ff371d"
              accessibilityLabel="Loading conversation"
            />
          </View>
        ) : (
          <KeyboardChatScrollView
            ref={scroll}
            style={s.flex}
            keyboardLiftBehavior="always"
            offset={keyboardOffset}
            automaticallyAdjustContentInsets={false}
            automaticallyAdjustKeyboardInsets={false}
            contentInsetAdjustmentBehavior="never"
            keyboardDismissMode={
              Platform.OS === 'ios' ? 'interactive' : 'on-drag'
            }
            contentContainerStyle={[
              s.history,
              s.nativeHistory,
              compact && s.historyCompact,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollSize}
            onLayout={() => {
              // Only composer growth/rotation changes this viewport; the library owns keyboard motion.
              if (metrics.current.nearBottom && !metrics.current.prepend)
                scroll.current?.scrollToEnd({ animated: false });
            }}
            onEndVisible={(visible) => {
              metrics.current.nearBottom = visible;
            }}
            onScroll={({ nativeEvent }) => {
              metrics.current.offset = nativeEvent.contentOffset.y;
            }}
          >
            {onEarlier && (
              <Pressable
                accessibilityRole="button"
                disabled={loadingEarlier}
                onPress={chooseEarlier}
                style={s.earlier}
              >
                <Text style={s.earlierText}>
                  {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
                </Text>
              </Pressable>
            )}
            {!rows.length && (
              <View style={s.state}>
                <Text style={s.stateText}>Say hello to {name}.</Text>
              </View>
            )}
            {rows.map((row) =>
              row.kind === 'photo' && preview ? (
                <View
                  key={row.id}
                  testID={`chat-photo-${row.id}`}
                  accessible={openedPhotoIds.includes(row.id)}
                  accessibilityRole={
                    openedPhotoIds.includes(row.id) ? 'image' : undefined
                  }
                  accessibilityLabel={
                    openedPhotoIds.includes(row.id)
                      ? `Photo from ${name}`
                      : undefined
                  }
                  style={s.photoCard}
                >
                  <View style={s.photoInside}>
                    {portrait !== undefined && (
                      <Portrait
                        index={portrait}
                        softened={!openedPhotoIds.includes(row.id)}
                        style={StyleSheet.absoluteFill}
                      />
                    )}
                    {!openedPhotoIds.includes(row.id) && (
                      <>
                        <LinearGradient
                          pointerEvents="none"
                          colors={['#5c2a0466', '#2a171b55', '#deb38e99']}
                          style={StyleSheet.absoluteFill}
                        />
                        <View
                          pointerEvents="none"
                          style={{ position: 'relative', zIndex: 1 }}
                        >
                          <Text style={s.photoTitle}>{row.content}</Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Open preview photo"
                          onPress={() => onOpenPhoto?.(row.id)}
                          style={s.photoOpen}
                        >
                          <Text style={s.photoOpenText}>OPEN</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              ) : row.kind === 'photo' ? (
                <View key={row.id}>{renderPhoto?.(row)}</View>
              ) : (
                <View
                  key={row.id}
                  style={[
                    s.message,
                    row.role === 'user' ? s.userMessage : s.aiMessage,
                  ]}
                >
                  {row.role === 'assistant' &&
                  row.id === revealReplyId &&
                  onRevealComplete ? (
                    <ReplyText
                      id={row.id}
                      text={row.content}
                      onComplete={onRevealComplete}
                    />
                  ) : (
                    <Text selectable style={s.messageText}>
                      {row.content}
                    </Text>
                  )}
                  {row.role === 'user' &&
                    (row.state === 'failed' ||
                      row.state === 'rejected' ||
                      row.expired) && (
                      <Text style={s.messageState}>
                        {row.state === 'rejected'
                          ? 'Message not sent'
                          : 'Reply interrupted'}
                      </Text>
                    )}
                  {row.role === 'user' &&
                    (row.state === 'failed' || row.expired) &&
                    onRetryRow && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Retry this message"
                        disabled={busy}
                        onPress={() => onRetryRow(row)}
                        style={s.retry}
                      >
                        <Text style={s.retryText}>Retry this message</Text>
                      </Pressable>
                    )}
                </View>
              ),
            )}
            {typing && !error && <TypingIndicator name={name} />}
          </KeyboardChatScrollView>
        )}
        <KeyboardStickyView
          offset={{ closed: 0, opened: keyboardOffset }}
          style={s.chatFooter}
        >
          {!!error && (
            <Text accessibilityLiveRegion="polite" style={s.error}>
              {error}
            </Text>
          )}
          <View
            style={[
              s.composerArea,
              { paddingBottom: Math.max(insets.bottom, 10) },
            ]}
          >
            <View style={s.composer}>
              <TextInput
                accessibilityLabel="Message"
                placeholder="Write your message"
                placeholderTextColor="#8b8889"
                value={text}
                onChangeText={onText}
                onFocus={showLatest}
                editable={!busy && !loading && !unavailable && !inputDisabled}
                multiline
                numberOfLines={1}
                maxLength={4000}
                onContentSizeChange={({ nativeEvent }) =>
                  setInputHeight(
                    Math.min(118, Math.max(48, nativeEvent.contentSize.height)),
                  )
                }
                style={[s.input, { height: inputHeight }]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                disabled={
                  busy ||
                  loading ||
                  unavailable ||
                  inputDisabled ||
                  !text.trim()
                }
                onPress={() => {
                  metrics.current.nearBottom = true;
                  onSend();
                }}
                style={({ pressed }) => [
                  s.send,
                  (busy ||
                    !text.trim() ||
                    loading ||
                    unavailable ||
                    inputDisabled) &&
                    s.disabled,
                  pressed && s.pressed,
                ]}
              >
                <DiscoverIcon
                  name="send"
                  size={29}
                  filled
                  color="#f3321a"
                  strokeWidth={1.6}
                />
              </Pressable>
            </View>
          </View>
        </KeyboardStickyView>
      </View>
      <Modal
        transparent
        visible={sheet !== null}
        animationType="fade"
        onRequestClose={() => setSheet(null)}
      >
        <View style={s.modal}>
          <View
            accessibilityViewIsModal
            style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}
          >
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>
                {sheet === 'diamonds' ? 'Diamonds' : name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close details"
                onPress={() => setSheet(null)}
                style={s.sheetClose}
              >
                <DiscoverIcon name="close" />
              </Pressable>
            </View>
            {sheet === 'character' ? (
              <Text style={s.sheetText}>
                {character?.bio ?? 'A fictional AI companion.'}
              </Text>
            ) : (
              <Text style={s.sheetText}>
                Purchases are currently unavailable.
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
