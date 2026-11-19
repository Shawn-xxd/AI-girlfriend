import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { DiscoverIcon } from '../discover/Icons';
import { Portrait } from '../onboarding/Portrait';
import { SettingsSheet } from '../settings/SettingsSheet';
import { openProductLink, type ProductLink } from '../settings/links';
import { useMobileViewer, useWallet } from '../api/queries';

const plans = [
  {
    id: 'yearly',
    name: 'Yearly',
    price: 'USD 49.99 / year',
    equivalent: 'USD 4.17 / month',
    badge: 'SAVE 68%',
  },
  {
    id: 'monthly',
    name: 'Monthly',
    price: 'USD 12.99 / month',
    equivalent: 'Billed monthly',
    badge: null,
  },
] as const;
const benefits = [
  'Unlimited chat',
  'Access to Private photos',
  '150 diamonds · One-time welcome gift',
  'Access to Premium characters',
  '2× diamond rewards & exclusive deals',
];
/** Presentation for approved plans. No purchase or entitlement is simulated. */
export function PremiumScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const diamonds = section === 'diamonds';
  const { userId } = useMobileViewer({ refreshOnMount: false });
  const wallet = useWallet(userId);
  const [selected, setSelected] = useState<'yearly' | 'monthly'>('monthly');
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
  } | null>(null);
  async function link(kind: ProductLink) {
    try {
      await openProductLink(kind);
    } catch {
      setNotice({
        title: kind === 'privacy' ? 'Privacy Policy' : 'Terms of Use',
        message: 'This page is not available yet. Please try again later.',
      });
    }
  }
  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/me');
  }
  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={s.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
      >
        <View style={s.hero}>
          <View style={s.portraits}>
            <Portrait index={0} style={s.portrait} />
            <Portrait index={2} style={s.portrait} />
          </View>
          <LinearGradient
            colors={['#08080b00', '#08080b40', '#08080b']}
            locations={[0, 0.35, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close purchase page"
            style={s.close}
          >
            <DiscoverIcon name="close" size={27} />
          </Pressable>
          <View style={s.heroCopy}>
            <Text style={s.eyebrow}>
              TEMPTA {diamonds ? 'DIAMONDS' : 'PREMIUM'}
            </Text>
            <Text accessibilityRole="header" style={s.title}>
              {diamonds ? 'MORE TO EXPLORE.' : 'WANT MORE?'}
            </Text>
          </View>
        </View>
        <View style={s.body}>
          {diamonds ? (
            <>
              <View style={s.balance}>
                <DiscoverIcon name="diamond" size={30} color="#ff4928" />
                <Text style={s.balanceNumber}>
                  {wallet.data?.availableDiamonds ?? '—'}
                </Text>
                <Text style={s.balanceLabel}>diamonds available</Text>
              </View>
              {wallet.isError && (
                <Pressable
                  onPress={() => void wallet.refetch()}
                  accessibilityRole="button"
                  style={s.retry}
                >
                  <Text style={s.note}>Balance unavailable · Retry</Text>
                </Pressable>
              )}
              <Text style={s.description}>
                Use diamonds to unlock Private photos. Photos you unlock remain
                yours.
              </Text>
              <View style={s.unavailable}>
                <Text style={s.unavailableTitle}>
                  Diamond packs coming soon
                </Text>
                <Text style={s.note}>
                  Diamond purchases are not available yet.
                </Text>
              </View>
              <Pressable
                onPress={() => router.setParams({ section: 'premium' })}
                accessibilityRole="button"
                style={s.explore}
              >
                <Text style={s.exploreText}>Explore Premium</Text>
                <DiscoverIcon name="crown" color="#ffbb38" />
              </Pressable>
            </>
          ) : (
            <>
              <View style={s.benefits}>
                {benefits.map((benefit) => (
                  <View key={benefit} style={s.benefit}>
                    <Text style={s.check}>✓</Text>
                    <Text style={s.benefitText}>{benefit}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.privateHint}>
                Private photos require diamonds. The 150-diamond welcome gift is
                granted once, not with each renewal.
              </Text>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Membership plan"
                style={s.plans}
              >
                {plans.map((plan) => (
                  <Pressable
                    key={plan.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected === plan.id }}
                    onPress={() => setSelected(plan.id)}
                    style={[s.plan, selected === plan.id && s.planSelected]}
                  >
                    <View style={s.planTop}>
                      <Text style={s.planName}>{plan.name}</Text>
                      <View
                        style={[
                          s.radio,
                          selected === plan.id && s.radioSelected,
                        ]}
                      >
                        {selected === plan.id && <View style={s.radioDot} />}
                      </View>
                    </View>
                    <View style={s.planBottom}>
                      <View style={s.planCopy}>
                        <Text style={s.price}>{plan.price}</Text>
                        <Text style={s.equivalent}>{plan.equivalent}</Text>
                      </View>
                      {plan.badge && (
                        <View style={s.badge}>
                          <Text style={s.badgeText}>{plan.badge}</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
              <Text style={s.renewal}>
                Auto-renews until cancelled. Cancel in your Apple subscription
                settings.
              </Text>
              <Text style={s.priceHint}>
                USD plan prices shown. Your local price will be confirmed before
                purchase.
              </Text>
              <Text accessibilityRole="status" style={s.availability}>
                Purchases are not available in this build yet.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                disabled
                style={s.continue}
              >
                <Text style={s.continueText}>UNAVAILABLE</Text>
              </Pressable>
            </>
          )}
          <View style={s.footer}>
            <Pressable
              accessibilityRole="link"
              onPress={() => void link('privacy')}
              style={s.footerButton}
            >
              <Text style={s.footerText}>Privacy</Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              onPress={() => void link('terms')}
              style={s.footerButton}
            >
              <Text style={s.footerText}>Terms</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setNotice({
                  title: 'Restore purchases',
                  message:
                    'Restoring purchases is not available in this build yet. Please try again later.',
                })
              }
              style={s.footerButton}
            >
              <Text style={s.footerText}>Restore</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
      <SettingsSheet
        title={notice?.title ?? ''}
        visible={!!notice}
        onClose={() => setNotice(null)}
      >
        <Text style={s.description}>{notice?.message}</Text>
      </SettingsSheet>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    backgroundColor: '#08080b',
  },
  content: { paddingBottom: 10 },
  hero: { height: 310, backgroundColor: '#242027' },
  portraits: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  portrait: { flex: 1, height: 400 },
  close: {
    position: 'absolute',
    top: 8,
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#09090b55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { marginTop: 'auto', paddingHorizontal: 22, paddingBottom: 14 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#ffce70',
  },
  title: {
    fontSize: 43,
    lineHeight: 48,
    color: '#ffad24',
    fontWeight: '900',
    marginTop: 10,
  },
  body: { paddingHorizontal: 22 },
  benefits: { gap: 15, paddingTop: 10 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: { color: '#ff386d', fontSize: 25, fontWeight: '900' },
  benefitText: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  privateHint: {
    color: '#aaa4ae',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 18,
  },
  plans: { gap: 12, marginTop: 26 },
  plan: {
    padding: 17,
    backgroundColor: '#222125',
    borderColor: '#555158',
    borderWidth: 1,
    borderRadius: 16,
  },
  planSelected: { borderColor: '#ff4a20', backgroundColor: '#491a09' },
  planTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planName: { color: '#fff', fontWeight: '800', fontSize: 19 },
  radio: {
    height: 22,
    width: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#9d959e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: '#ff6a3b' },
  radioDot: {
    height: 12,
    width: 12,
    borderRadius: 6,
    backgroundColor: '#ff5a22',
  },
  planBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  planCopy: { flex: 1 },
  price: { color: '#fff', fontSize: 17, fontWeight: '600' },
  equivalent: { color: '#bdb4bd', fontSize: 13, marginTop: 5 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#ff3514',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  renewal: {
    color: '#ada6ae',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 20,
  },
  priceHint: {
    color: '#8d8791',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 8,
  },
  availability: {
    color: '#d4b9b1',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 20,
  },
  continue: {
    backgroundColor: '#5c2920',
    borderRadius: 18,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  continueText: { color: '#c0aaa5', fontSize: 19, fontWeight: '900' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  footerButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  footerText: {
    color: '#aaa5ad',
    textDecorationLine: 'underline',
    fontSize: 13,
  },
  description: {
    color: '#c9c1cb',
    fontSize: 16,
    lineHeight: 24,
    paddingVertical: 16,
  },
  balance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  balanceNumber: { color: '#fff', fontSize: 32, fontWeight: '800' },
  balanceLabel: { color: '#b8b0ba', fontSize: 14, flex: 1 },
  unavailable: {
    padding: 20,
    backgroundColor: '#222025',
    borderRadius: 18,
    gap: 12,
    marginTop: 16,
  },
  unavailableTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  note: { fontSize: 14, color: '#bcb4bf', lineHeight: 20 },
  explore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 22,
  },
  exploreText: { color: '#ffbb38', fontSize: 16, fontWeight: '700' },
  retry: { minHeight: 44, justifyContent: 'center' },
});
