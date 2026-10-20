/**
 * «в сети» · «был(а) 5 мин назад» · «был(а) в 10:20» · «был(а) 12.07.25» — `PresenceLabel`
 * нативной. Единственное место, где время превращается в слова о том, где человек.
 *
 * «мин», а не «минут»: сокращения не склоняются, и одна/две/пять минут не нужны. Пол Matrix не
 * знает — поэтому «был(а)», как у всех русских клиентов. Ничего (`null`) — сказать нечего,
 * и шапка рисует то, что рисовала всегда.
 */
import type { Presence } from '../../core/session/presence.svelte.ts';
import { clock } from '../../design/time';
import { t } from '../../i18n/index.svelte.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function presenceLabel(presence: Presence, now: number, locale: string): string | null {
  // Слово сервера «сейчас» важнее всего ниже.
  if (presence.online) return t('presence.online');
  if (presence.lastActive === undefined) return null;
  // Часы сервера и устройства расходятся на секунды: «-1 мин назад» не бывает.
  const ago = Math.max(0, now - presence.lastActive);
  if (ago < MINUTE) return t('presence.justNow');
  if (ago < HOUR) return t('presence.minutesAgo', { count: Math.floor(ago / MINUTE) });
  // Двенадцать, а не двадцать четыре: «19 ч назад» — арифметика, а не ответ.
  if (ago < 12 * HOUR) return t('presence.hoursAgo', { count: Math.floor(ago / HOUR) });
  const last = new Date(presence.lastActive);
  const today = new Date(now);
  if (sameDay(last, today)) return t('presence.atTime', { time: clock(presence.lastActive, locale) });
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(last, yesterday)) return t('presence.yesterday');
  // Числами — их читают, а не разбирают: 12.07.25 по-русски, 7/12/25 по-английски.
  return t('presence.at', { date: new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: '2-digit' }).format(last) });
}
