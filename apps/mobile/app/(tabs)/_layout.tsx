import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, HomeIcon } from '../../src/home/ui';
import { useOnboardingStore } from '../../src/onboarding/store';

export default function TabLayout() {
  const hydrated = useOnboardingStore((state) => state.hydrated);
  const completed = useOnboardingStore((state) => state.completed);
  const insets = useSafeAreaInsets();

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator
          color={colors.accent}
          accessibilityLabel="Loading your preferences"
        />
      </View>
    );
  }
  if (!completed) return <Redirect href="/onboarding" />;

  return (
    <View style={styles.screen}>
      <View style={styles.frame}>
        <Tabs
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.background },
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.muted,
            tabBarStyle: {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              height: 64 + insets.bottom,
              paddingTop: 9,
              paddingBottom: Math.max(insets.bottom, 9),
            },
            tabBarItemStyle: { minHeight: 44 },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '500', marginTop: 3 },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Discover',
              tabBarIcon: ({ color }) => (
                <HomeIcon name="discover" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="chats"
            options={{
              title: 'Chats',
              tabBarIcon: ({ color }) => (
                <HomeIcon name="chats" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="me"
            options={{
              title: 'Me',
              tabBarIcon: ({ color }) => <HomeIcon name="me" color={color} />,
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  frame: { flex: 1, width: '100%', maxWidth: 500 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
