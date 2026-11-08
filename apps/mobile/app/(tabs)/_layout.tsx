import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/home/ui';
import { DiscoverIcon } from '../../src/discover/Icons';
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
  if (!completed && process.env.EXPO_PUBLIC_DISCOVER_PREVIEW !== '1')
    return <Redirect href="/onboarding" />;

  return (
    <View style={styles.screen}>
      <View style={styles.frame}>
        <Tabs
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.background },
            tabBarActiveTintColor: '#fff',
            tabBarInactiveTintColor: '#a4a4a4',
            tabBarShowLabel: true,
            tabBarLabelPosition: 'below-icon',
            tabBarStyle: {
              backgroundColor: '#303030',
              borderTopWidth: 0,
              height: 88 + insets.bottom,
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom, 8),
            },
            tabBarItemStyle: { minHeight: 64 },
            tabBarIconStyle: { width: 44, height: 44 },
            tabBarLabelStyle: {
              fontSize: 10,
              lineHeight: 13,
              flexShrink: 0,
              fontWeight: '500',
              marginTop: 3,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Discover',
              tabBarIcon: ({ color, focused }) => (
                <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
                  <DiscoverIcon
                    name="cards"
                    color={color}
                    size={27}
                    filled
                    strokeWidth={0}
                  />
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="chats"
            options={{
              title: 'Chats',
              tabBarIcon: ({ color, focused }) => (
                <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
                  <DiscoverIcon
                    name="chat"
                    color={color}
                    size={27}
                    filled
                    strokeWidth={0}
                  />
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="me"
            options={{
              title: 'Me',
              tabBarIcon: ({ color, focused }) => (
                <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
                  <DiscoverIcon
                    name="person"
                    color={color}
                    size={27}
                    filled
                    strokeWidth={0}
                  />
                </View>
              ),
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#484848',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: { backgroundColor: '#ff290b' },
  screen: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  frame: { flex: 1, width: '100%', maxWidth: 500 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
