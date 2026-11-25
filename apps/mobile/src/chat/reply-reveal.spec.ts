import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { firstReplyCharacter, revealReply } from './reply-reveal';

describe('presentation of a newly received, completed reply', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reveals complete Chinese characters and emoji clusters, preserving the original text', () => {
    const characters = ['你', '好', '👩🏽‍💻', 'e\u0301', '🇨🇳', '\n'];
    const text = characters.join('');
    const shown: string[] = [];
    const done = jest.fn();
    revealReply(text, (value) => shown.push(value), done);
    expect(firstReplyCharacter('👩🏽‍💻hello')).toBe('👩🏽‍💻');
    expect(shown).toEqual(['你']);
    jest.advanceTimersByTime(200);
    const validPrefixes = characters.map((_, index) =>
      characters.slice(0, index + 1).join(''),
    );
    expect(shown.every((value) => validPrefixes.includes(value))).toBe(true);
    expect(shown.at(-1)).toBe(text);
    expect(done).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('bounds presentation time for long replies rather than making the user wait for every character', () => {
    const text = 'A long reply. '.repeat(1000);
    let shown = '';
    const done = jest.fn();
    revealReply(
      text,
      (value) => {
        shown = value;
      },
      done,
    );
    jest.advanceTimersByTime(2000);
    expect(shown.length).toBeGreaterThan(1);
    expect(shown.length).toBeLessThan(text.length);
    jest.advanceTimersByTime(250);
    expect(shown).toBe(text);
    expect(done).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops updates on cancellation without calling completion or leaving a timer', () => {
    const show = jest.fn();
    const done = jest.fn();
    const cancel = revealReply(
      'A message that stops when the page closes',
      show,
      done,
    );
    jest.advanceTimersByTime(48);
    const calls = show.mock.calls.length;
    cancel();
    jest.advanceTimersByTime(5000);
    expect(show).toHaveBeenCalledTimes(calls);
    expect(done).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('finishes empty and single-grapheme replies immediately without a timer', () => {
    for (const text of ['', '👍🏽']) {
      const show = jest.fn();
      const done = jest.fn();
      const cancel = revealReply(text, show, done);
      expect(show).toHaveBeenLastCalledWith(text);
      expect(done).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
      cancel();
    }
  });
});
