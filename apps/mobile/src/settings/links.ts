import { Linking } from 'react-native';
export type ProductLink = 'privacy' | 'terms' | 'support';
export async function openProductLink(kind: ProductLink) {
  const urls = {
    privacy: process.env.EXPO_PUBLIC_PRIVACY_URL,
    terms: process.env.EXPO_PUBLIC_TERMS_URL,
    support: process.env.EXPO_PUBLIC_SUPPORT_URL,
  };
  const configured = urls[kind];
  if (!configured)
    throw new Error('This page is not available yet. Please try again later.');
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('This page is not available yet. Please try again later.');
  await Linking.openURL(url.toString());
}
