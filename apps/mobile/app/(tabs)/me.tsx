import { useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { DiscoverIcon } from '../../src/discover/Icons';
import { DiamondButton } from '../../src/components/DiamondButton';
import { Portrait } from '../../src/onboarding/Portrait';
import {
  PRONOUN_OPTIONS,
  isValidName,
  limitNameInput,
  type Pronouns,
} from '../../src/onboarding/model';
import {
  onboardingStore,
  useOnboardingStore,
} from '../../src/onboarding/store';
import { useMobileViewer, useWallet } from '../../src/api/queries';
import { openProductLink, type ProductLink } from '../../src/settings/links';
import { SettingsSheet } from '../../src/settings/SettingsSheet';

export default function MeScreen() {
  const draft = useOnboardingStore((state) => state.draft);
  const { userId } = useMobileViewer({ refreshOnMount: false });
  const wallet = useWallet(userId);
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(''),
    [pronouns, setPronouns] = useState<Pronouns | null>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState<{ title: string; message: string } | null>(
      null,
    );
  function edit() {
    setName(draft.name);
    setPronouns(draft.pronouns);
    setError('');
    setEditing(true);
  }
  async function save() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      if (!onboardingStore.getState().updateProfile({ name, pronouns }))
        throw new Error('Enter a name with 1–40 characters.');
      await onboardingStore.getState().flush();
      if (onboardingStore.getState().storageError)
        throw new Error('Unable to save on this device. Please try again.');
      setEditing(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to save. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }
  async function link(kind: ProductLink) {
    try {
      await openProductLink(kind);
    } catch {
      setNotice({
        title:
          kind === 'privacy'
            ? 'Privacy Policy'
            : kind === 'terms'
              ? 'Terms of Use'
              : 'Help & feedback',
        message: 'This page is not available yet. Please try again later.',
      });
    }
  }
  const premium = () => router.push('/premium');
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={s.screen}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Text accessibilityRole="header" style={s.heading}>
            SETTINGS
          </Text>
          <DiamondButton
            balance={wallet.data?.availableDiamonds}
            onPress={() =>
              router.push({
                pathname: '/premium',
                params: { section: 'diamonds' },
              })
            }
          />
          <Pressable
            onPress={premium}
            accessibilityRole="button"
            accessibilityLabel="Explore Premium"
            style={s.crown}
          >
            <DiscoverIcon name="crown" size={28} color="#20150b" filled />
          </Pressable>
        </View>
        {wallet.isError && (
          <Pressable
            onPress={() => void wallet.refetch()}
            accessibilityRole="button"
            style={s.balanceRetry}
          >
            <Text style={s.muted}>Balance unavailable · Retry</Text>
          </Pressable>
        )}
        <Pressable
          onPress={premium}
          accessibilityRole="button"
          accessibilityLabel="Explore Tempta Premium"
          style={({ pressed }) => [s.banner, pressed && s.pressed]}
        >
          <Portrait index={2} style={s.bannerPortrait} />
          <LinearGradient
            colors={['#16151a00', '#16151ad9', '#16151a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.bannerCopy}>
            <Text style={s.gold}>TEMPTA PREMIUM</Text>
            <Text style={s.bannerTitle}>More to discover.</Text>
            <View style={s.join}>
              <Text style={s.joinText}>Explore Premium</Text>
              <DiscoverIcon name="crown" size={18} color="#291400" />
            </View>
          </View>
        </Pressable>
        <Text style={s.section}>PROFILE</Text>
        <Row
          icon="person"
          title="Name"
          value={draft.name || 'You'}
          onPress={edit}
        />
        <Row
          icon="person"
          title="Pronouns"
          value={
            PRONOUN_OPTIONS.find((x) => x.id === draft.pronouns)?.label ??
            'Not set'
          }
          onPress={edit}
        />
        <Text style={s.deviceHint}>Profile saved on this device.</Text>
        <Text style={s.section}>OTHER</Text>
        <Row
          icon="chat"
          title="Help & feedback"
          onPress={() => void link('support')}
        />
        <Row icon="crown" title="Restore purchases" onPress={premium} />
        <Text style={s.section}>LEGAL</Text>
        <Row
          icon="lock"
          title="Privacy Policy"
          onPress={() => void link('privacy')}
        />
        <Row
          icon="info"
          title="Terms of Use"
          onPress={() => void link('terms')}
        />
      </ScrollView>
      <SettingsSheet
        title="Edit profile"
        visible={editing}
        busy={saving}
        onClose={() => setEditing(false)}
      >
        <Text style={s.label}>Name</Text>
        <TextInput
          accessibilityLabel="Your name"
          value={name}
          onChangeText={(v) => setName(limitNameInput(v))}
          maxLength={80}
          editable={!saving}
          autoCapitalize="words"
          autoCorrect={false}
          style={s.input}
          placeholder="Your name"
          placeholderTextColor="#8d888e"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
        />
        <Text style={s.label}>Pronouns</Text>
        <View style={s.options}>
          {[...PRONOUN_OPTIONS, { id: null, label: 'Not set' }].map(
            (option) => (
              <Pressable
                key={option.id ?? 'none'}
                accessibilityRole="radio"
                accessibilityState={{ checked: pronouns === option.id }}
                disabled={saving}
                onPress={() => setPronouns(option.id)}
                style={[s.option, pronouns === option.id && s.selected]}
              >
                <Text style={s.optionText}>{option.label}</Text>
              </Pressable>
            ),
          )}
        </View>
        {error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving || !isValidName(name) }}
          disabled={saving || !isValidName(name)}
          onPress={() => void save()}
          style={[s.save, (saving || !isValidName(name)) && s.disabled]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.saveText}>Save</Text>
          )}
        </Pressable>
      </SettingsSheet>
      <SettingsSheet
        title={notice?.title ?? ''}
        visible={!!notice}
        onClose={() => setNotice(null)}
      >
        <Text style={s.notice}>{notice?.message}</Text>
      </SettingsSheet>
    </SafeAreaView>
  );
}
function Row({
  icon,
  title,
  value,
  onPress,
}: {
  icon: Parameters<typeof DiscoverIcon>[0]['name'];
  title: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}: ${value}` : title}
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && s.pressed]}
    >
      <DiscoverIcon name={icon} size={25} />
      <Text style={s.rowTitle}>{title}</Text>
      {value && (
        <Text numberOfLines={1} style={s.value}>
          {value}
        </Text>
      )}
      <Text style={s.chevron}>›</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#141318',
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
  },
  content: { paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 8 },
  heading: { flex: 1, fontSize: 25, fontWeight: '900', color: '#fff' },
  crown: {
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: '#ffba28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    height: 175,
    backgroundColor: '#252127',
    overflow: 'hidden',
    marginTop: 8,
  },
  bannerPortrait: {
    position: 'absolute',
    left: 0,
    top: -10,
    width: 155,
    height: 230,
  },
  bannerCopy: {
    marginLeft: 140,
    padding: 18,
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  gold: { color: '#ffc051', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  bannerTitle: { fontSize: 21, color: '#fff', fontWeight: '800' },
  join: {
    backgroundColor: '#ffab23',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },
  joinText: { fontWeight: '800', color: '#291400', fontSize: 14 },
  section: {
    backgroundColor: '#29282d',
    color: '#aaa6ad',
    paddingHorizontal: 18,
    paddingVertical: 10,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 1,
    marginTop: 20,
  },
  row: {
    minHeight: 78,
    marginHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#343137',
  },
  rowTitle: { color: '#fff', fontSize: 17, fontWeight: '600', flex: 1 },
  value: { color: '#aaa5ad', fontSize: 16, maxWidth: '40%' },
  chevron: { fontSize: 28, color: '#99939c' },
  deviceHint: {
    color: '#aaa5ad',
    fontSize: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  pressed: { opacity: 0.7 },
  balanceRetry: { paddingHorizontal: 18, paddingBottom: 8 },
  muted: { color: '#b6adb4', fontSize: 12 },
  label: { color: '#b9b1bc', fontSize: 14, marginBottom: 10, marginTop: 10 },
  input: {
    backgroundColor: '#29262e',
    color: '#fff',
    fontSize: 18,
    padding: 15,
    borderRadius: 12,
    minHeight: 54,
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#5d535f',
  },
  selected: { borderColor: '#ff4a24', backgroundColor: '#572619' },
  optionText: { color: '#fff', fontSize: 15 },
  save: {
    marginTop: 24,
    backgroundColor: '#ff3514',
    minHeight: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  disabled: { opacity: 0.4 },
  error: { color: '#ffb0a3', fontSize: 14, marginTop: 16 },
  notice: { color: '#d6cfd8', fontSize: 16, lineHeight: 25, paddingBottom: 20 },
});
