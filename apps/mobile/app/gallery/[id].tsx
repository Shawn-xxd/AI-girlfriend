import { ActivityIndicator, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { useOnboardingStore } from '../../src/onboarding/store';
import { discoverPreview } from '../../src/api/queries';
import { previewCharacters } from '../../src/discover/preview';
import { GalleryScreen } from '../../src/gallery/GalleryScreen';
import { LiveGallery } from '../../src/gallery/LiveGallery';
export default function GalleryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const hydrated = useOnboardingStore((state) => state.hydrated);
  const completed = useOnboardingStore((state) => state.completed);
  const parsed = z.uuid().safeParse(id);
  if (!hydrated)
    return (
      <View style={{ flex: 1, backgroundColor: '#181818' }}>
        <ActivityIndicator />
      </View>
    );
  if (!parsed.success) return <Redirect href="/(tabs)" />;
  if (discoverPreview) {
    const character = previewCharacters.find((item) => item.id === parsed.data);
    return character ? (
      <GalleryScreen
        key={parsed.data}
        character={character}
        preview
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace({
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
  return <LiveGallery key={parsed.data} id={parsed.data} />;
}
