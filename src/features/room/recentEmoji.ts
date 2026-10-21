/**
 * Недавние эмодзи (`RecentEmoji` нативной). Отдельно от каталога: каталог — несколько тысяч
 * литералов и грузится вместе с панелью, а недавние нужны меню и настройкам сразу.
 */

/** Двенадцать недавних — ряд из шести быстрых дважды, двумя ровными рядами. */
export const RECENT_LIMIT = 12;

/** Новое — первым, повтор — без дубля, не длиннее двенадцати. */
export function addRecent(emoji: string, recent: readonly string[]): string[] {
  return [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_LIMIT);
}
