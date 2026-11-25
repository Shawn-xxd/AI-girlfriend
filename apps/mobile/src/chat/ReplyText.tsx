import { useEffect, useState } from 'react';
import { AppState, Text } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { firstReplyCharacter, revealReply } from './reply-reveal';
import { chatStyles as s } from './styles';

/** Mounted only for this screen's newly received reply. History always uses ordinary Text. */
export function ReplyText({
  id,
  text,
  onComplete,
}: {
  id: string;
  text: string;
  onComplete: (id: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(() =>
    reducedMotion ? text : firstReplyCharacter(text),
  );
  useEffect(() => {
    if (reducedMotion || AppState.currentState !== 'active') {
      onComplete(id);
      return;
    }
    const stop = revealReply(text, setVisible, () => onComplete(id));
    // Do not replay or keep a display timer running while the app is backgrounded.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        stop();
        onComplete(id);
      }
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [id, text, reducedMotion, onComplete]);
  return (
    <Text
      selectable
      style={s.messageText}
      accessibilityLabel={text}
      accessibilityLiveRegion="none"
    >
      {reducedMotion ? text : visible}
    </Text>
  );
}
