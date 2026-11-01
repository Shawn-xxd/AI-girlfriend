import type { PropsWithChildren } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

export const colors = {
  background: '#111112',
  surface: '#1b1a1d',
  text: '#ffffff',
  muted: '#9a989c',
  accent: '#f33422',
  border: '#2b292d',
};

export type HomeIconName = 'discover' | 'chats' | 'me' | 'arrow';

export function HomeIcon({
  name,
  color = colors.text,
  size = 24,
}: {
  name: HomeIconName;
  color?: ColorValue;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {name === 'discover' && (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="m15.7 8.3-2.1 5.3-5.3 2.1 2.1-5.3 5.3-2.1Z" />
        </>
      )}
      {name === 'chats' && (
        <>
          <Path d="M20.5 11.3a8.3 8.3 0 0 1-8.5 8.1 9.5 9.5 0 0 1-3.1-.5L4 20l1.1-4.4a7.7 7.7 0 0 1-1.6-4.3A8.3 8.3 0 0 1 12 3.2a8.3 8.3 0 0 1 8.5 8.1Z" />
          <Path d="M8 10h8M8 13.5h5" />
        </>
      )}
      {name === 'me' && (
        <>
          <Circle cx={12} cy={8} r={3.6} />
          <Path d="M4.5 20v-1.2a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6V20" />
        </>
      )}
      {name === 'arrow' && <Path d="M5 12h14m-5-5 5 5-5 5" />}
    </Svg>
  );
}

export function HomeScreen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={styles.brandMark} />
          <Text style={styles.wordmark}>FLIRTLY</Text>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function PageHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={styles.pageTitle}>
        {title}
      </Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  children,
}: PropsWithChildren<{
  icon: HomeIconName;
  title: string;
  description: string;
}>) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <HomeIcon name={icon} color={colors.accent} size={32} />
      </View>
      <Text accessibilityRole="header" style={styles.emptyTitle}>
        {title}
      </Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {children}
    </View>
  );
}

export const homeStyles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  buttonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 32,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  wordmark: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 3,
  },
  heading: { marginTop: 34, gap: 10 },
  pageTitle: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '600',
    letterSpacing: -1.2,
  },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 68,
  },
  emptyIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#241a1a',
    borderWidth: 1,
    borderColor: '#3a2423',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyDescription: {
    maxWidth: 290,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 28,
  },
});
