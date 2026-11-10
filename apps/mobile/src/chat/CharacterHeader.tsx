import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Character } from '@companion/shared';
import { DiscoverIcon } from '../discover/Icons';
import { DiamondButton } from '../components/DiamondButton';
import { Portrait } from '../onboarding/Portrait';
import { chatStyles as s } from './styles';
export type DisplayCharacter = Character & { portraitIndex?: number };
export function CharacterHeader({
  character,
  preview = false,
  onBack,
  onCharacter,
  onDiamonds,
  onAction,
  action = 'gallery',
  previewLevel,
  level = previewLevel,
}: {
  character?: DisplayCharacter;
  preview?: boolean;
  onBack: () => void;
  onCharacter?: () => void;
  onDiamonds: () => void;
  onAction?: () => void;
  action?: 'gallery' | 'chat';
  previewLevel?: number;
  level?: number;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = width < 360 || height < 700;
  const name = character?.name ?? 'AI companion';
  return (
    <View
      style={[
        s.header,
        { paddingTop: Math.max(insets.top, compact ? 16 : 32) + 10 },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          action === 'gallery' ? 'Back to Discover' : 'Back to chat'
        }
        onPress={onBack}
        style={s.back}
        hitSlop={{ left: 4, right: 4 }}
      >
        <DiscoverIcon name="back" color="#ff0050" size={28} strokeWidth={2.2} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`About ${name}`}
        disabled={!onCharacter}
        onPress={onCharacter}
      >
        <View
          style={[
            s.avatar,
            compact && s.avatarCompact,
            level !== undefined && local.ring,
          ]}
        >
          {character?.portraitIndex !== undefined ? (
            <Portrait
              index={character.portraitIndex}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <DiscoverIcon name="person" size={27} color="#b7a5a2" />
          )}
        </View>
        {level !== undefined && (
          <View
            accessibilityLabel={`${preview ? 'Preview level' : 'Level'} ${level}`}
            style={local.level}
          >
            <Text style={local.levelText}>{level}</Text>
          </View>
        )}
      </Pressable>
      <View style={s.headerTitle}>
        <Text accessibilityRole="header" numberOfLines={1} style={s.title}>
          {name}
        </Text>
        <Text style={s.ai}>{preview ? 'AI · PREVIEW' : 'AI COMPANION'}</Text>
        {character?.archetype && (
          <View style={s.archetype}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={s.archetypeText}
            >
              {character.archetype}
            </Text>
          </View>
        )}
      </View>
      <DiamondButton onPress={onDiamonds} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          action === 'gallery' ? 'Open gallery' : 'Return to chat'
        }
        disabled={!onAction}
        onPress={onAction}
        style={s.photoTouch}
      >
        <View style={s.photoIcon}>
          <DiscoverIcon
            name={action === 'gallery' ? 'photo' : 'chat'}
            size={20}
            filled={action === 'chat'}
          />
        </View>
      </Pressable>
    </View>
  );
}
const local = StyleSheet.create({
  ring: { borderLeftColor: '#ff3c7e', borderWidth: 3 },
  level: {
    position: 'absolute',
    bottom: -5,
    alignSelf: 'center',
    minWidth: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#ff2c0b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  levelText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
