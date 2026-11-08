import { ActivityIndicator, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { useOnboardingStore } from '../../src/onboarding/store';
import { discoverPreview } from '../../src/api/queries';
import { previewCharacters } from '../../src/discover/preview';
import { PreviewConversation } from '../../src/chat/PreviewConversation';
import { LiveConversation } from '../../src/chat/LiveConversation';
export default function ConversationRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const hydrated = useOnboardingStore((state) => state.hydrated);
  const completed = useOnboardingStore((state) => state.completed);
  const parsed = z.uuid().safeParse(params.id);
  if (!hydrated)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#080808',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color="#ff351c" />
      </View>
    );
  if (!parsed.success) return <Redirect href="/(tabs)" />;
  if (discoverPreview)
    return previewCharacters.some(
      (character) => character.id === parsed.data,
    ) ? (
      <PreviewConversation key={parsed.data} id={parsed.data} />
    ) : (
      <Redirect href="/(tabs)" />
    );
  if (!completed) return <Redirect href="/onboarding" />;
  return <LiveConversation key={parsed.data} id={parsed.data} />;
}
