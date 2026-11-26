import { ActivityIndicator, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { useOnboardingStore } from '../../src/onboarding/store';
import { discoverPreview } from '../../src/api/queries';
import { previewCharacters } from '../../src/discover/preview';
import { CharacterProfileScreen } from '../../src/character/CharacterProfileScreen';
import { LiveCharacterProfile } from '../../src/character/LiveCharacterProfile';

export default function CharacterProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const hydrated = useOnboardingStore((state) => state.hydrated);
  const completed = useOnboardingStore((state) => state.completed);
  const parsed = z.uuid().safeParse(id);
  if (!hydrated)
    return (
      <View
        style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}
      >
        <ActivityIndicator color="#ff351c" />
      </View>
    );
  if (!parsed.success) return <Redirect href="/(tabs)" />;
  if (discoverPreview) {
    const character = previewCharacters.find((item) => item.id === parsed.data);
    return character ? (
      <CharacterProfileScreen
        character={character}
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace({
                pathname: '/conversation/[id]',
                params: { id: parsed.data },
              })
        }
        onGallery={() =>
          router.navigate({
            pathname: '/gallery/[id]',
            params: { id: parsed.data },
          })
        }
        onChat={() =>
          router.dismissTo({
            pathname: '/conversation/[id]',
            params: { id: parsed.data },
          })
        }
      />
    ) : (
      <Redirect href="/(tabs)" />
    );
  }
  if (!completed) return <Redirect href="/onboarding" />;
  return <LiveCharacterProfile key={parsed.data} id={parsed.data} />;
}
