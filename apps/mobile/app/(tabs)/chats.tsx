import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { ConversationSummary } from '@companion/shared';
import { mobileApi } from '../../src/api/client';
import { discoverPreview, useMobileViewer } from '../../src/api/queries';
import { DiscoverIcon } from '../../src/discover/Icons';
import { previewCharacters } from '../../src/discover/preview';
import { Portrait } from '../../src/onboarding/Portrait';
import { previewRows, useChatPreview } from '../../src/chat/preview';
export default function ChatsScreen() {
  const { guest, viewer, userId } = useMobileViewer();
  const threads = useChatPreview((state) => state.threads);
  const conversations = useQuery({
    queryKey: ['mobile-api', userId, 'conversations'],
    queryFn: ({ signal }) => mobileApi.conversations(userId!, signal),
    enabled: !!userId && !discoverPreview,
    retry: false,
  });
  useFocusEffect(
    useCallback(() => {
      if (userId && !discoverPreview) void conversations.refetch();
    }, [userId, conversations.refetch]),
  );
  const preview = threads.map((thread) => ({
    id: thread.characterId,
    character: previewCharacters.find(
      (character) => character.id === thread.characterId,
    )!,
    last:
      thread.rows.at(-1)?.content ??
      previewRows(thread.characterId)[1]?.content ??
      '',
    date: thread.updatedAt,
  }));
  const real = (conversations.data?.conversations ?? []).map(
    (conversation: ConversationSummary) => ({
      id: conversation.id,
      character: {
        ...conversation.character,
        portraitIndex: undefined as number | undefined,
      },
      last: conversation.lastMessage?.content ?? 'Say hello',
      date: conversation.lastMessage?.createdAt ?? conversation.createdAt,
    }),
  );
  const items = discoverPreview ? preview : real;
  const failure =
    !discoverPreview &&
    (guest.status === 'error' || viewer.isError || conversations.isError);
  const loading =
    !discoverPreview && !failure && (!userId || conversations.isPending);
  function retry() {
    if (guest.status !== 'ready') void guest.retry().catch(() => undefined);
    else {
      void viewer.refetch();
      void conversations.refetch();
    }
  }
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={s.screen}>
      <View style={s.heading}>
        <Text accessibilityRole="header" style={s.title}>
          Chats
        </Text>
        {discoverPreview && <Text style={s.preview}>PREVIEW</Text>}
      </View>
      {loading ? (
        <View style={s.state}>
          <ActivityIndicator color="#f33422" />
        </View>
      ) : failure ? (
        <View style={s.state}>
          <Text style={s.stateText}>Unable to load chats.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={s.button}
          >
            <Text style={s.buttonText}>Try again</Text>
          </Pressable>
        </View>
      ) : !items.length ? (
        <View style={s.state}>
          <DiscoverIcon name="chat" color="#655c60" size={42} />
          <Text style={s.stateText}>No conversations yet.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/(tabs)')}
            style={s.button}
          >
            <Text style={s.buttonText}>Explore Discover</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        >
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Open chat with ${item.character.name}`}
              onPress={() =>
                router.push({
                  pathname: '/conversation/[id]',
                  params: { id: item.id },
                })
              }
              style={({ pressed }) => [s.row, pressed && s.pressed]}
            >
              <View style={s.avatar}>
                {item.character.portraitIndex !== undefined ? (
                  <Portrait
                    index={item.character.portraitIndex}
                    style={StyleSheet.absoluteFill}
                  />
                ) : (
                  <DiscoverIcon name="person" color="#bcaaa5" size={28} />
                )}
              </View>
              <View style={s.text}>
                <View style={s.nameRow}>
                  <Text numberOfLines={1} style={s.name}>
                    {item.character.name}
                  </Text>
                  <Text style={s.time}>
                    {new Date(item.date).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text numberOfLines={2} style={s.caption}>
                  {item.last}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111112' },
  heading: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: '#fff',
    fontFamily: 'Arial',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  preview: { color: '#8d8288', fontSize: 8, letterSpacing: 1.2 },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  row: {
    minHeight: 98,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2b272a',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2d2528',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 7 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
  time: { color: '#8d8288', fontSize: 10 },
  caption: { color: '#b4a9ad', fontSize: 13, lineHeight: 18 },
  state: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    padding: 24,
  },
  stateText: { color: '#c7bbbf', fontSize: 16 },
  button: {
    minHeight: 48,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: '#f33422',
  },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
