import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { healthResponseSchema } from '@companion/shared';
async function checkApi() {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!baseUrl) throw new Error('Configure EXPO_PUBLIC_API_URL');
  const response = await fetch(
    `${baseUrl.replace(/\/$/, '')}/v1/health/ready`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) throw new Error('API unavailable');
  return healthResponseSchema.parse(await response.json());
}
export default function Home() {
  const health = useQuery({ queryKey: ['api-readiness'], queryFn: checkApi });
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>DEVELOPMENT · PHASE 1</Text>
        <Text style={styles.title}>AI Companion</Text>
        <Text style={styles.body}>Foundation connection check</Text>
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {health.isPending
            ? 'Connecting…'
            : health.isError
              ? 'Connection failed. Check API settings and retry.'
              : 'API and database connected.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={health.isFetching}
          onPress={() => void health.refetch()}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Retry connection</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101114' },
  content: { flex: 1, justifyContent: 'center', padding: 28, gap: 18 },
  eyebrow: { color: '#b6a187', fontSize: 12, letterSpacing: 2 },
  title: { color: '#faf7f2', fontSize: 36, fontWeight: '600' },
  body: { color: '#b6b5bb', fontSize: 16, lineHeight: 24 },
  button: {
    backgroundColor: '#e9dfd1',
    borderRadius: 12,
    padding: 16,
    alignSelf: 'flex-start',
  },
  buttonText: { color: '#161519', fontWeight: '600' },
});
