import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
import type { Character, ChatStatus } from '@companion/shared';
import { DiscoverIcon } from '../discover/Icons';
import { CharacterHeader } from './CharacterHeader';
import { PreviewPhotoViewer } from '../gallery/PhotoViewer';
import { Portrait } from '../onboarding/Portrait';
import type { ChatRow } from './preview';
import { chatStyles as s } from './styles';
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
  busy?: boolean;
  status?: ChatStatus | null;
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
  busy = false,
  status,
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
  const [photo, setPhoto] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [inputHeight, setInputHeight] = useState(48);
  useEffect(() => {
    if (!text) setInputHeight(48);
  }, [text]);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const metrics = useRef({
    height: 0,
    offset: 0,
    nearBottom: !preview,
    prepend: false,
  });
  useEffect(() => {
    if (earlierError) metrics.current.prepend = false;
  }, [earlierError]);
  useEffect(() => {
    const shown = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboard(true),
    );
    const hidden = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboard(false),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const name = character?.name ?? 'AI companion';
  const portrait = character?.portraitIndex;
  function scrollSize(_: number, height: number) {
    if (metrics.current.prepend) {
      const offset = metrics.current.offset + height - metrics.current.height;
      scroll.current?.scrollTo({ y: Math.max(0, offset), animated: false });
      metrics.current.prepend = false;
    } else if (metrics.current.nearBottom)
      scroll.current?.scrollToEnd({ animated: false });
    metrics.current.height = height;
  }
  const chooseEarlier = () => {
    metrics.current.prepend = true;
    onEarlier?.();
  };
  return (
    <SafeAreaView edges={['left', 'right']} style={s.screen}>
      <View pointerEvents="none" style={s.backdrop}>
        {portrait !== undefined && (
          <Portrait index={portrait} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={['#000000f5', '#0000002b', '#00000026', '#000000f9']}
          locations={[0, 0.2, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <CharacterHeader
          character={character}
          preview={preview}
          onBack={onBack}
          onCharacter={() => setSheet('character')}
          onDiamonds={() => setSheet('diamonds')}
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
          <ScrollView
            ref={scroll}
            contentContainerStyle={[s.history, compact && s.historyCompact]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollSize}
            scrollEventThrottle={64}
            onScroll={({ nativeEvent: e }) => {
              metrics.current.offset = e.contentOffset.y;
              metrics.current.nearBottom =
                e.contentSize.height -
                  e.contentOffset.y -
                  e.layoutMeasurement.height <
                100;
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
                <View key={row.id} style={s.photoCard}>
                  <View style={s.photoInside}>
                    {portrait !== undefined && (
                      <Portrait
                        index={portrait}
                        softened
                        style={StyleSheet.absoluteFill}
                      />
                    )}
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
                      onPress={() => setPhoto(true)}
                      style={s.photoOpen}
                    >
                      <Text style={s.photoOpenText}>OPEN</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View
                  key={row.id}
                  style={[
                    s.message,
                    row.role === 'user' ? s.userMessage : s.aiMessage,
                  ]}
                >
                  <Text selectable style={s.messageText}>
                    {row.content}
                  </Text>
                  {row.role === 'user' &&
                    row.state &&
                    row.state !== 'completed' && (
                      <Text style={s.messageState}>
                        {row.state === 'pending' && !row.expired
                          ? 'Preparing a reply…'
                          : row.state === 'rejected'
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
          </ScrollView>
        )}
        {busy && !unavailable && (
          <View accessibilityLiveRegion="polite" style={s.waiting}>
            <ActivityIndicator size="small" color="#e4c9be" />
            <Text style={s.waitingText}>
              {status === 'saving' ? 'Almost ready…' : 'Thinking…'}
            </Text>
          </View>
        )}
        {!!error && (
          <Text accessibilityLiveRegion="polite" style={s.error}>
            {error}
          </Text>
        )}
        <View
          style={[
            s.composerArea,
            { paddingBottom: keyboard ? 8 : Math.max(insets.bottom, 10) },
          ]}
        >
          <View style={s.composer}>
            <TextInput
              accessibilityLabel="Message"
              placeholder="Write your message"
              placeholderTextColor="#8b8889"
              value={text}
              onChangeText={onText}
              editable={!busy && !loading && !unavailable}
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
              disabled={busy || loading || unavailable || !text.trim()}
              onPress={() => {
                metrics.current.nearBottom = true;
                onSend();
              }}
              style={({ pressed }) => [
                s.send,
                (busy || !text.trim() || loading || unavailable) && s.disabled,
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
      </KeyboardAvoidingView>
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
      <PreviewPhotoViewer
        visible={photo && preview}
        index={portrait}
        onClose={() => setPhoto(false)}
      />
    </SafeAreaView>
  );
}
