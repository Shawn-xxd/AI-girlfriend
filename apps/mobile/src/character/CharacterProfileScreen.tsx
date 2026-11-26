import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import type { DisplayCharacter } from '../chat/CharacterHeader';
import { DiscoverIcon } from '../discover/Icons';
import { Portrait } from '../onboarding/Portrait';

export function CharacterProfileScreen({
  character,
  loading = false,
  unavailable = false,
  onRetry,
  onBack,
  onGallery,
  onChat,
}: {
  character?: DisplayCharacter;
  loading?: boolean;
  unavailable?: boolean;
  onRetry?: () => void;
  onBack: () => void;
  onGallery: () => void;
  onChat: () => void;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ready = !!character && !loading && !unavailable;
  return (
    <SafeAreaView edges={['left', 'right']} style={s.screen}>
      <View pointerEvents="none" style={s.cover}>
        {character?.coverUrl ? (
          <Image
            accessibilityLabel={`${character.name} cover`}
            source={{ uri: character.coverUrl, cache: 'force-cache' }}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
          />
        ) : character?.portraitIndex !== undefined ? (
          <Portrait
            index={character.portraitIndex}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <LinearGradient
          colors={['#00000026', '#00000000', '#00000070', '#000000f5', '#000']}
          locations={[0, 0.35, 0.6, 0.82, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {ready ? (
        <ScrollView
          style={s.flex}
          contentContainerStyle={[
            s.content,
            {
              minHeight: Math.max(0, height - Math.max(insets.bottom, 16) - 92),
            },
          ]}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
        >
          <View
            style={[s.coverSpace, { minHeight: Math.max(260, height * 0.49) }]}
          />
          <View style={s.details}>
            <LinearGradient
              pointerEvents="none"
              colors={['#00000000', '#000']}
              style={s.detailsFade}
            />
            <View style={s.titleRow}>
              <Text accessibilityRole="header" style={s.name}>
                {character.name}
              </Text>
              {!!character.archetype && (
                <View style={s.archetype}>
                  <Text style={s.archetypeText}>{character.archetype}</Text>
                </View>
              )}
            </View>
            {!!character.bio && <Text style={s.bio}>{character.bio}</Text>}
            {!!character.tags.length && (
              <View style={s.tags}>
                {character.tags.map((tag, index) => (
                  <View key={`${index}.${tag}`} style={s.tag}>
                    <Text style={s.tagText}>
                      {tag.startsWith('#') ? tag : `#${tag}`}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        <View style={s.state}>
          {loading && !unavailable ? (
            <ActivityIndicator
              color="#ff351c"
              accessibilityLabel="Loading character profile"
            />
          ) : (
            <>
              <Text style={s.stateText}>Unable to load this character.</Text>
              {onRetry && (
                <Pressable
                  accessibilityRole="button"
                  onPress={onRetry}
                  style={s.retry}
                >
                  <Text style={s.stateText}>Try again</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={({ pressed }) => [
          s.back,
          { top: Math.max(insets.top, 16) + 12 },
          pressed && s.pressed,
        ]}
      >
        <DiscoverIcon name="back" size={29} color="#ff0050" strokeWidth={2.2} />
      </Pressable>
      <View style={[s.actions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open character gallery"
          disabled={!ready}
          onPress={onGallery}
          style={({ pressed }) => [
            s.button,
            s.gallery,
            !ready && s.disabled,
            pressed && s.pressed,
          ]}
        >
          <Text style={s.buttonText}>GALLERY</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue chatting"
          disabled={!ready}
          onPress={onChat}
          style={({ pressed }) => [
            s.button,
            s.chat,
            !ready && s.disabled,
            pressed && s.pressed,
          ]}
        >
          <Text style={s.buttonText}>CHAT</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    backgroundColor: '#000',
  },
  flex: { flex: 1 },
  cover: { ...StyleSheet.absoluteFill },
  content: { flexGrow: 1 },
  coverSpace: { flex: 1 },
  details: {
    backgroundColor: '#000',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
    gap: 14,
  },
  detailsFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -120,
    height: 120,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { flex: 1, color: '#fff', fontSize: 32, fontWeight: '900' },
  archetype: {
    maxWidth: '48%',
    borderRadius: 11,
    backgroundColor: '#ff6474',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  archetypeText: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  bio: { color: '#f3f1f1', fontSize: 16, lineHeight: 23 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    maxWidth: '100%',
  },
  tagText: { color: '#242438', fontSize: 13, fontWeight: '600' },
  back: {
    position: 'absolute',
    left: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#353437e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 14,
    backgroundColor: '#000',
  },
  button: {
    flex: 1,
    minHeight: 56,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  gallery: { backgroundColor: '#ff2c0b' },
  chat: { backgroundColor: '#7098f3' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  state: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
    gap: 18,
  },
  stateText: { color: '#eee', fontSize: 15, textAlign: 'center' },
  retry: {
    borderWidth: 1,
    borderColor: '#ffffff60',
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
});
