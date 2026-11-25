import { splitGraphemes } from 'unicode-segmenter/grapheme';

/** Presentation of an already validated, saved reply; never a simulated provider stream. */
export function revealReply(
  text: string,
  show: (text: string) => void,
  done: () => void,
) {
  const parts = [...splitGraphemes(text)];
  const duration = Math.min(2200, parts.length * 18);
  show(parts[0] ?? '');
  if (parts.length < 2) {
    done();
    return () => undefined;
  }
  const started = Date.now();
  const timer = setInterval(() => {
    const count = Math.min(
      parts.length,
      Math.max(
        1,
        Math.floor(((Date.now() - started) / duration) * parts.length),
      ),
    );
    show(parts.slice(0, count).join(''));
    if (count === parts.length) {
      clearInterval(timer);
      done();
    }
  }, 24);
  return () => clearInterval(timer);
}

export function firstReplyCharacter(text: string) {
  return splitGraphemes(text).next().value ?? '';
}
