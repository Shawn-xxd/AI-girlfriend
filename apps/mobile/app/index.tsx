import { Redirect } from 'expo-router';
export default function Home() {
  return (
    <Redirect
      href={
        process.env.EXPO_PUBLIC_DISCOVER_PREVIEW === '1'
          ? '/(tabs)'
          : '/onboarding'
      }
    />
  );
}
