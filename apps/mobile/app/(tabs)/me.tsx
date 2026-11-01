import { useState } from 'react';
import { router } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  colors,
  HomeIcon,
  HomeScreen,
  PageHeading,
  homeStyles,
} from '../../src/home/ui';
import {
  FAVORITE_OPTIONS,
  GOAL_OPTIONS,
  INTEREST_OPTIONS,
  PRONOUN_OPTIONS,
} from '../../src/onboarding/model';
import { useOnboardingStore } from '../../src/onboarding/store';

export default function MeScreen() {
  const draft = useOnboardingStore((state) => state.draft);
  const reset = useOnboardingStore((state) => state.reset);
  const [confirmReplay, setConfirmReplay] = useState(false);
  const pronouns = PRONOUN_OPTIONS.find(
    (item) => item.id === draft.pronouns,
  )?.label;
  const interests = INTEREST_OPTIONS.filter((item) =>
    draft.interests.includes(item.id),
  );
  const favorites = FAVORITE_OPTIONS.filter((item) =>
    draft.favorites.includes(item.id),
  );
  const goals = GOAL_OPTIONS.filter((item) => draft.goals.includes(item.id));

  function replayIntroduction() {
    setConfirmReplay(false);
    reset();
    router.replace('/onboarding');
  }

  return (
    <HomeScreen>
      <PageHeading title="Me" subtitle="A little about you." />
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <HomeIcon name="me" size={30} />
        </View>
        <View style={styles.profileText}>
          <Text style={styles.name}>{draft.name || 'You'}</Text>
          {pronouns ? <Text style={styles.pronouns}>{pronouns}</Text> : null}
        </View>
      </View>
      <View style={styles.preferenceCard}>
        <Text style={styles.eyebrow}>YOUR PREFERENCES</Text>
        <Text style={styles.localDescription}>
          Your introduction answers on this device.
        </Text>
        <View style={styles.preferenceGroup}>
          <Text style={styles.sectionTitle}>Interests</Text>
          {interests.length ? (
            <View style={styles.tags}>
              {interests.map((item) => (
                <View key={item.id} style={styles.tag}>
                  <Text style={styles.tagText}>{item.label}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.summary}>No interests selected</Text>
          )}
        </View>
        {favorites.length > 0 && (
          <View style={styles.preferenceGroup}>
            <Text style={styles.sectionTitle}>You enjoy</Text>
            <Text style={styles.summary}>
              {favorites.map((item) => item.label).join(' · ')}
            </Text>
          </View>
        )}
        {goals.length > 0 && (
          <View style={styles.preferenceGroup}>
            <Text style={styles.sectionTitle}>You’re here for</Text>
            <Text style={styles.summary}>
              {goals.map((item) => item.label).join(' · ')}
            </Text>
          </View>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setConfirmReplay(true)}
        style={({ pressed }) => [
          styles.replayButton,
          pressed && homeStyles.pressed,
        ]}
      >
        <Text style={styles.replayText}>Replay introduction</Text>
        <HomeIcon name="arrow" size={19} color={colors.muted} />
      </Pressable>
      <Text style={styles.replayHint}>Start again with new answers.</Text>
      <Modal
        visible={confirmReplay}
        transparent
        animationType="none"
        onRequestClose={() => setConfirmReplay(false)}
      >
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              Replay the introduction?
            </Text>
            <Text style={styles.modalBody}>
              This clears your introduction answers on this device so you can
              start again. It won’t delete chats or an account.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={replayIntroduction}
              style={({ pressed }) => [
                homeStyles.button,
                pressed && homeStyles.pressed,
              ]}
            >
              <Text style={homeStyles.buttonText}>
                Clear answers & start again
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmReplay(false)}
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && homeStyles.pressed,
              ]}
            >
              <Text style={styles.cancelText}>Keep my answers</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </HomeScreen>
  );
}

const styles = StyleSheet.create({
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginVertical: 32,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#262326',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: { flex: 1, gap: 6 },
  name: { color: colors.text, fontSize: 25, fontWeight: '500' },
  pronouns: { color: colors.muted, fontSize: 14 },
  preferenceCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 22,
    backgroundColor: '#171618',
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.8,
  },
  localDescription: { color: colors.muted, fontSize: 13, marginTop: 8 },
  preferenceGroup: { gap: 12, marginTop: 26 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '500' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    borderWidth: 1,
    borderColor: '#393136',
    backgroundColor: '#242024',
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  tagText: { color: '#dddadd', fontSize: 13 },
  summary: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  replayButton: {
    minHeight: 52,
    marginTop: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  replayText: { color: '#d2cfd3', fontSize: 14 },
  replayHint: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  modalBackdrop: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000bb',
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '600',
    lineHeight: 29,
  },
  modalBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 24,
    marginTop: 14,
    marginBottom: 26,
  },
  cancelButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  cancelText: { color: colors.text, fontSize: 14 },
});
