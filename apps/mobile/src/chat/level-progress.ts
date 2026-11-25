import type { CharacterProgress } from '@companion/shared';

export function levelProgress(progress: CharacterProgress | undefined) {
  if (!progress) return { fraction: 0, label: '' };
  const { level, effectiveChatCount: total, nextLevel } = progress;
  const base = `Level ${level}`;
  if (!nextLevel)
    return {
      fraction: level > 1 ? 1 : 0,
      label: `${base}, ${total} completed rounds`,
    };
  const floor =
    progress.currentLevelRequiredCount ?? (level === 1 ? 0 : undefined);
  if (floor === undefined || nextLevel.requiredCount <= floor)
    return { fraction: 0, label: `${base}, ${total} completed rounds` };
  const required = nextLevel.requiredCount - floor;
  const completed = Math.min(required, Math.max(0, total - floor));
  return {
    fraction: completed / required,
    label: `${base}, ${completed} of ${required} rounds to level ${nextLevel.level}`,
  };
}
