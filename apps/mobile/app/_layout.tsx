import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { GuestSessionProvider } from '../src/auth';
import { useOnboardingStore } from '../src/onboarding/store';
import { AppStartup } from '../src/startup/AppStartup';
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});
export default function Layout() {
  const hydrated = useOnboardingStore((state) => state.hydrated);
  const completed = useOnboardingStore((state) => state.completed);
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <GuestSessionProvider
            enabled={
              hydrated &&
              completed &&
              process.env.EXPO_PUBLIC_DISCOVER_PREVIEW !== '1'
            }
          >
            <StatusBar style="light" />
            <AppStartup>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: '#111112' },
                  animation: 'fade',
                }}
              />
            </AppStartup>
          </GuestSessionProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
