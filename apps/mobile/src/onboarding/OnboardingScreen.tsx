import {
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import {
  FAVORITE_OPTIONS,
  GOAL_OPTIONS,
  INTEREST_OPTIONS,
  MAX_NAME_INPUT_LENGTH,
  ONBOARDING_STEPS,
  PRONOUN_OPTIONS,
  isValidName,
  type OnboardingStep,
} from './model';
import { useOnboardingStore } from './store';
import { Portrait } from './Portrait';

import { RED, styles } from './styles';
const BACKGROUNDS: Record<OnboardingStep, number> = {
  splash: 0,
  welcome: 0,
  'role-play': 1,
  characters: 2,
  privacy: 2,
  meet: 3,
  profile: 3,
  interests: 4,
  favorites: 4,
  goals: 1,
  match: 5,
  offer: 2,
};

function Mark({
  kind,
  size = 20,
  color = '#fff',
}: {
  kind: 'back' | 'arrow' | 'check' | 'lock' | 'shield' | 'close';
  size?: number;
  color?: string;
}) {
  const paths = {
    back: 'M14 6l-6 6 6 6M8 12h12',
    arrow: 'M10 6l6 6-6 6M4 12h12',
    check: 'M5 12l4 4L19 6',
    lock: 'M7 10V7a5 5 0 0110 0v3M5 10h14v11H5zM12 14v3',
    shield: 'M12 2l8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5zM8 12l3 3 5-6',
    close: 'M6 6l12 12M6 18L18 6',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={paths[kind]}
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Brand({ large = false }: { large?: boolean }) {
  return (
    <Text style={[styles.brand, large && styles.largeBrand]}>
      FLIRT<Text style={styles.red}>LY</Text>
      <Text style={styles.brandDot}>.</Text>
    </Text>
  );
}

function Choice({
  label,
  selected,
  onPress,
  children,
  wide = false,
  grid = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
  wide?: boolean;
  grid?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        wide && styles.wideChoice,
        grid && styles.gridChoice,
        selected && styles.selectedChoice,
        pressed && styles.pressed,
      ]}
    >
      {children}
      {selected && (
        <View style={styles.choiceCheck}>
          <Mark kind="check" size={12} />
        </View>
      )}
    </Pressable>
  );
}

function ChatBubble({
  children,
  right = false,
}: {
  children: ReactNode;
  right?: boolean;
}) {
  return (
    <View style={[styles.bubble, right && styles.rightBubble]}>
      <Text style={[styles.bubbleText, right && styles.rightBubbleText]}>
        {children}
      </Text>
    </View>
  );
}

export function OnboardingScreen() {
  const store = useOnboardingStore((state) => state);
  const { step, draft, hydrated } = store;
  const { height } = useWindowDimensions();
  const [imageReady, setImageReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const fade = useRef(new Animated.Value(1)).current;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !imageReady || step !== 'splash') return;
    const timer = setTimeout(() => store.next(), reduceMotion ? 0 : 850);
    return () => clearTimeout(timer);
  }, [hydrated, imageReady, step, reduceMotion, store.next]);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    fade.setValue(reduceMotion ? 1 : 0);
    const animation = Animated.timing(fade, {
      toValue: 1,
      duration: reduceMotion ? 0 : 220,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [step, fade, reduceMotion]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      store.back(),
    );
    return () => subscription.remove();
  }, [store.back]);

  async function openLegal(kind: 'privacy' | 'terms') {
    const configured =
      kind === 'privacy'
        ? process.env.EXPO_PUBLIC_PRIVACY_URL
        : process.env.EXPO_PUBLIC_TERMS_URL;
    try {
      if (!configured || new URL(configured).protocol !== 'https:')
        throw new Error('Unavailable');
      await Linking.openURL(configured);
    } catch {
      setNotice({
        title: kind === 'privacy' ? 'Privacy Policy' : 'Terms of Use',
        message:
          'This page is temporarily unavailable. Please try again later.',
      });
    }
  }

  function proceed() {
    if (step === 'welcome') store.setTermsAccepted(true);
    store.next();
  }

  const showBack = ONBOARDING_STEPS.indexOf(step) > 1;
  const isOffer = step === 'offer';
  const isForm = ['profile', 'interests', 'favorites', 'goals'].includes(step);
  const disabled =
    (step === 'welcome' && !draft.adultConfirmed) ||
    (step === 'profile' && !isValidName(draft.name));
  const unavailablePurchases = () =>
    setNotice({
      title: 'Premium',
      message:
        'Purchases are currently unavailable. You can continue without a subscription.',
    });

  const headings: Partial<
    Record<
      OnboardingStep,
      { eyebrow: string; title: string; description: string }
    >
  > = {
    'role-play': {
      eyebrow: 'A LITTLE IMAGINATION',
      title: 'STEP INTO\nYOUR STORY.',
      description:
        'A new scene. A different side of you.\nMake every conversation your own.',
    },
    characters: {
      eyebrow: 'FIND YOUR VIBE',
      title: 'CHARACTERS FOR\nEVERY TASTE.',
      description:
        'Sweet, thoughtful, a little adventurous.\nThere’s someone for every side of you.',
    },
    privacy: {
      eyebrow: 'ON YOUR TERMS',
      title: 'YOUR SPACE.\nYOUR PACE.',
      description:
        'You choose what to share.\nGet to know how your information is handled.',
    },
    meet: {
      eyebrow: 'SOMETHING STARTS WITH HELLO',
      title: 'AI COMPANIONS\nCAN’T WAIT TO MEET YOU.',
      description: 'A little curiosity can go a long way.',
    },
    profile: {
      eyebrow: 'LET’S MAKE THIS PERSONAL',
      title: 'WHO ARE YOU,\nSWEETHEART?',
      description: 'Tell me a little about yourself.',
    },
    interests: {
      eyebrow: 'YOUR KIND OF CONNECTION',
      title: 'WHAT ARE\nYOU INTO?',
      description: 'Choose as many as you like.',
    },
    favorites: {
      eyebrow: 'THE GOOD STUFF',
      title: 'WHAT DO YOU\nLOVE MOST?',
      description: 'Choose as many as you like.',
    },
    goals: {
      eyebrow: 'A LITTLE SOMETHING FOR YOU',
      title: 'WHAT BRINGS\nYOU HERE?',
      description: 'Choose as many as you like.',
    },
    match: {
      eyebrow: 'YOUR STORY STARTS HERE',
      title: 'LET’S FIND YOUR\nKIND OF COMPANY.',
      description: 'A world of AI characters, ready to explore.',
    },
    offer: {
      eyebrow: 'MEET PREMIUM',
      title: 'MORE MOMENTS.\nMORE POSSIBILITY.',
      description:
        'Discover a little more room to chat\nand keep the conversation going.',
    },
  };
  const heading = headings[step];

  return (
    <View style={styles.canvas}>
      <View style={styles.phone}>
        <Portrait
          index={BACKGROUNDS[step]}
          style={StyleSheet.absoluteFill}
          onReady={() => setImageReady(true)}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[
            'rgba(10,10,11,0.04)',
            'rgba(10,10,11,0.06)',
            'rgba(15,15,16,0.76)',
            '#111112',
            '#111112',
          ]}
          locations={[0, 0.26, 0.53, 0.78, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          {!hydrated || step === 'splash' ? (
            <View style={styles.splash}>
              <View style={styles.splashTop}>
                <Text style={styles.tinyLabel}>
                  A LITTLE SPARK. A NEW STORY.
                </Text>
              </View>
              <View style={styles.splashBottom}>
                <Brand large />
                <Text style={styles.splashDescription}>
                  Your next favorite hello.
                </Text>
                <View style={styles.loadingLine}>
                  <View
                    style={[
                      styles.loadingFill,
                      { width: hydrated && imageReady ? '100%' : '12%' },
                    ]}
                  />
                </View>
                <Text style={styles.disclosure}>
                  AI companions · Adults 18+
                </Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.header}>
                {showBack ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={store.back}
                    style={({ pressed }) => [
                      styles.back,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Mark kind="back" color={RED} />
                  </Pressable>
                ) : (
                  <View style={styles.headerSpacer} />
                )}
                <View
                  accessibilityLabel={`Step ${ONBOARDING_STEPS.indexOf(step)} of 11`}
                  style={styles.progressDots}
                >
                  {ONBOARDING_STEPS.slice(1).map((item, index) => (
                    <View
                      key={item}
                      style={[
                        styles.dot,
                        index <= ONBOARDING_STEPS.indexOf(step) - 1 &&
                          styles.activeDot,
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.headerHeart}>♥</Text>
              </View>
              <KeyboardAvoidingView
                style={styles.keyboard}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              >
                <ScrollView
                  ref={scroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.scroll,
                    { paddingTop: height < 700 ? 72 : 140 },
                  ]}
                >
                  <Animated.View
                    key={step}
                    style={[
                      styles.content,
                      isForm && styles.formContent,
                      { opacity: fade },
                    ]}
                  >
                    {step === 'welcome' && (
                      <>
                        <View style={styles.welcomeBubbles}>
                          <ChatBubble>
                            Hey you. How’s your day going? ✨
                          </ChatBubble>
                          <ChatBubble right>
                            Better now that you’re here.
                          </ChatBubble>
                        </View>
                        <Brand large />
                        <Text style={styles.welcomeTitle}>
                          A little spark starts here.
                        </Text>
                        <Text style={styles.description}>
                          Meet AI companions for thoughtful chats,{`\n`}playful
                          stories, and moments that feel like you.
                        </Text>
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityLabel="I am 18 or older"
                          accessibilityState={{ checked: draft.adultConfirmed }}
                          aria-checked={draft.adultConfirmed}
                          onPress={() =>
                            store.setAdultConfirmed(!draft.adultConfirmed)
                          }
                          style={styles.ageRow}
                        >
                          <View
                            style={[
                              styles.checkbox,
                              draft.adultConfirmed && styles.checkedBox,
                            ]}
                          >
                            {draft.adultConfirmed && (
                              <Mark kind="check" size={14} />
                            )}
                          </View>
                          <Text style={styles.ageText}>I am 18 or older</Text>
                        </Pressable>
                      </>
                    )}
                    {step === 'meet' && (
                      <View style={styles.storyBubble}>
                        <ChatBubble>
                          Hey there. Want to get to know each other? 💌
                        </ChatBubble>
                      </View>
                    )}
                    {step === 'match' && (
                      <View style={styles.storyBubble}>
                        <Text style={styles.floatingHeart}>♥</Text>
                        <ChatBubble>
                          Nice to meet you, {draft.name.trim()}. Ready for a
                          little spark? ✨
                        </ChatBubble>
                      </View>
                    )}
                    {isOffer && (
                      <View style={styles.offerTeaser}>
                        <LinearGradient
                          colors={['#ffca7b', '#e98a3e']}
                          style={styles.teaserBorder}
                        >
                          <View style={styles.teaserInner}>
                            <Portrait
                              index={1}
                              softened
                              style={StyleSheet.absoluteFill}
                            />
                            <View style={styles.teaserShade} />
                            <Mark kind="lock" size={25} />
                            <Text style={styles.teaserLabel}>
                              A LITTLE{`\n`}CLOSER.
                            </Text>
                          </View>
                        </LinearGradient>
                        <View style={styles.offerNote}>
                          <Text style={styles.goldStar}>✦</Text>
                          <Text style={styles.offerNoteTitle}>
                            Make more{`\n`}of every hello.
                          </Text>
                          <Text style={styles.offerNoteBody}>
                            Find your favorite kind{`\n`}of conversation.
                          </Text>
                        </View>
                      </View>
                    )}
                    {heading && (
                      <View style={styles.heading}>
                        <Text style={styles.eyebrow}>{heading.eyebrow}</Text>
                        <Text
                          accessibilityRole="header"
                          style={[styles.title, isForm && styles.formTitle]}
                        >
                          {heading.title}
                        </Text>
                        <Text style={styles.description}>
                          {heading.description}
                        </Text>
                      </View>
                    )}
                    {step === 'characters' && (
                      <View style={styles.vibeRow}>
                        {['Sweet', 'Playful', 'Thoughtful'].map((label) => (
                          <View style={styles.vibe} key={label}>
                            <Text style={styles.vibeText}>{label}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {step === 'privacy' && (
                      <Pressable
                        accessibilityRole="link"
                        onPress={() => void openLegal('privacy')}
                        style={styles.privacyLink}
                      >
                        <Mark kind="shield" color="#b6b4b8" size={18} />
                        <Text style={styles.privacyLinkText}>
                          Read our Privacy Policy
                        </Text>
                        <Mark kind="arrow" size={15} color="#b6b4b8" />
                      </Pressable>
                    )}
                    {step === 'profile' && (
                      <View style={styles.profileForm}>
                        <Text style={styles.fieldLabel}>My name is</Text>
                        <TextInput
                          accessibilityLabel="Your name"
                          autoComplete="given-name"
                          autoCapitalize="words"
                          autoCorrect={false}
                          placeholder="Your name"
                          placeholderTextColor="#87848a"
                          selectionColor={RED}
                          value={draft.name}
                          onChangeText={store.setName}
                          maxLength={MAX_NAME_INPUT_LENGTH}
                          returnKeyType="done"
                          onSubmitEditing={() => {
                            if (isValidName(draft.name)) proceed();
                          }}
                          onFocus={() =>
                            setTimeout(
                              () =>
                                scroll.current?.scrollToEnd({
                                  animated: !reduceMotion,
                                }),
                              180,
                            )
                          }
                          style={[
                            styles.nameInput,
                            draft.name.length > 0 &&
                              !isValidName(draft.name) &&
                              styles.invalidInput,
                          ]}
                        />
                        {draft.name.length > 0 && !isValidName(draft.name) && (
                          <Text
                            accessibilityLiveRegion="polite"
                            style={styles.error}
                          >
                            Use a name between 1 and 40 characters.
                          </Text>
                        )}
                        <Text style={styles.fieldLabel}>
                          My pronouns{' '}
                          <Text style={styles.optional}>(optional)</Text>
                        </Text>
                        <View style={styles.pronouns}>
                          {PRONOUN_OPTIONS.map((option) => (
                            <Pressable
                              key={option.id}
                              accessibilityRole="radio"
                              accessibilityLabel={option.label}
                              accessibilityState={{
                                checked: draft.pronouns === option.id,
                              }}
                              aria-checked={draft.pronouns === option.id}
                              onPress={() =>
                                store.setPronouns(
                                  draft.pronouns === option.id
                                    ? null
                                    : option.id,
                                )
                              }
                              style={({ pressed }) => [
                                styles.pronoun,
                                draft.pronouns === option.id &&
                                  styles.selectedChoice,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text style={styles.choiceText}>
                                {option.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    )}
                    {step === 'interests' && (
                      <View style={styles.chips}>
                        {INTEREST_OPTIONS.map((option) => (
                          <Choice
                            key={option.id}
                            label={option.label}
                            selected={draft.interests.includes(option.id)}
                            onPress={() => store.toggleInterest(option.id)}
                          >
                            <Text style={styles.chipEmoji}>{option.emoji}</Text>
                            <Text style={styles.choiceText}>
                              {option.label}
                            </Text>
                          </Choice>
                        ))}
                      </View>
                    )}
                    {step === 'favorites' && (
                      <View style={styles.options}>
                        {FAVORITE_OPTIONS.map((option) => (
                          <Choice
                            key={option.id}
                            wide
                            label={option.label}
                            selected={draft.favorites.includes(option.id)}
                            onPress={() => store.toggleFavorite(option.id)}
                          >
                            <Text style={styles.optionEmoji}>
                              {option.emoji}
                            </Text>
                            <Text style={styles.optionText}>
                              {option.label}
                            </Text>
                          </Choice>
                        ))}
                      </View>
                    )}
                    {step === 'goals' && (
                      <View style={styles.goalGrid}>
                        {GOAL_OPTIONS.map((option) => (
                          <Choice
                            key={option.id}
                            grid
                            label={option.label}
                            selected={draft.goals.includes(option.id)}
                            onPress={() => store.toggleGoal(option.id)}
                          >
                            <View style={styles.goalContents}>
                              <Text style={styles.goalEmoji}>
                                {option.emoji}
                              </Text>
                              <Text style={styles.goalText}>
                                {option.label}
                              </Text>
                            </View>
                          </Choice>
                        ))}
                      </View>
                    )}
                    <View style={styles.actions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          isOffer
                            ? 'Subscribe'
                            : step === 'welcome'
                              ? 'Accept and continue'
                              : 'Continue'
                        }
                        accessibilityState={{ disabled }}
                        disabled={disabled}
                        onPress={isOffer ? unavailablePurchases : proceed}
                        style={({ pressed }) => [
                          styles.primary,
                          isOffer && styles.goldButton,
                          disabled && styles.disabledButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.primaryText,
                            isOffer && styles.goldButtonText,
                          ]}
                        >
                          {isOffer
                            ? 'SUBSCRIBE'
                            : step === 'welcome'
                              ? 'ACCEPT AND CONTINUE'
                              : 'CONTINUE'}
                        </Text>
                        {step !== 'welcome' && (
                          <Mark
                            kind="arrow"
                            size={18}
                            color={isOffer ? '#34200c' : '#fff'}
                          />
                        )}
                      </Pressable>
                      {step === 'welcome' && (
                        <Text style={styles.legalText}>
                          By continuing, you accept our{' '}
                          <Text
                            accessibilityRole="link"
                            onPress={() => void openLegal('terms')}
                            style={styles.inlineLink}
                          >
                            Terms of Use
                          </Text>
                          {`\n`}and acknowledge our{' '}
                          <Text
                            accessibilityRole="link"
                            onPress={() => void openLegal('privacy')}
                            style={styles.inlineLink}
                          >
                            Privacy Policy
                          </Text>
                          .
                        </Text>
                      )}
                      {isOffer && (
                        <>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="No thanks, continue without Premium"
                            onPress={store.finish}
                            style={({ pressed }) => [
                              styles.skipButton,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={styles.skipText}>NO THANKS</Text>
                          </Pressable>
                          <View style={styles.offerFooter}>
                            <Pressable
                              accessibilityRole="link"
                              onPress={() => void openLegal('terms')}
                              hitSlop={8}
                              style={styles.footerTarget}
                            >
                              <Text style={styles.footerLink}>Terms</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="link"
                              onPress={() => void openLegal('privacy')}
                              hitSlop={8}
                              style={styles.footerTarget}
                            >
                              <Text style={styles.footerLink}>Privacy</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              onPress={unavailablePurchases}
                              hitSlop={8}
                              style={styles.footerTarget}
                            >
                              <Text style={styles.footerLink}>Restore</Text>
                            </Pressable>
                          </View>
                        </>
                      )}
                      <Text style={styles.disclosure}>
                        AI companions · Adults 18+
                      </Text>
                      {store.storageError !== null && (
                        <Text
                          accessibilityLiveRegion="polite"
                          style={styles.storageError}
                        >
                          Progress could not be saved on this device.
                        </Text>
                      )}
                    </View>
                  </Animated.View>
                </ScrollView>
              </KeyboardAvoidingView>
            </>
          )}
        </SafeAreaView>
        <Modal
          visible={notice !== null}
          transparent
          animationType={reduceMotion ? 'none' : 'fade'}
          onRequestClose={() => setNotice(null)}
        >
          <View style={styles.modalBackdrop}>
            <View accessibilityViewIsModal style={styles.modalCard}>
              <Text accessibilityRole="header" style={styles.modalTitle}>
                {notice?.title}
              </Text>
              <Text style={styles.modalBody}>{notice?.message}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setNotice(null)}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>GOT IT</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}
