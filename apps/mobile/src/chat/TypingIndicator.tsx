import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { chatStyles as s } from './styles';

/** The standard three-dot chat pattern, using Expo's recommended animation library. */
export function TypingIndicator({ name }: { name: string }) {
  return (
    <View
      style={[s.message, s.aiMessage, s.typingBubble]}
      accessible
      accessibilityLabel={`${name} is typing`}
      accessibilityLiveRegion="polite"
      testID="chat-typing"
    >
      {[0, 1, 2].map((index) => (
        <TypingDot key={index} index={index} />
      ))}
    </View>
  );
}
function TypingDot({ index }: { index: number }) {
  const y = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!reducedMotion)
      y.value = withDelay(
        index * 120,
        withRepeat(
          withSequence(
            withTiming(-3, { duration: 280 }),
            withTiming(0, { duration: 280 }),
            withTiming(0, { duration: 360 }),
          ),
          -1,
        ),
      );
    return () => cancelAnimation(y);
  }, [index, reducedMotion, y]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));
  return <Animated.View style={[s.typingDot, style]} />;
}
