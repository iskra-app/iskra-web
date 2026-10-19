/**
 * Лента как строки: разделители дней и сообщения, собранные в серии.
 *
 * Серия — подряд от одного человека, не дальше пяти минут друг от друга (`runWindow`
 * нативной Искры), в пределах одного дня и не через служебную строку. Внутри серии
 * имя и лицо не повторяются, а зазор тоньше сетки.
 */
import { isService, type Message, type ServiceEvent } from './message';

export const RUN_WINDOW_MS = 5 * 60 * 1000;

export type TimelineItem =
  | { kind: 'day'; key: string; ts: number }
  /** «Непрочитанные сообщения» — где человек остановился в прошлый раз (`m.fully_read`). */
  | { kind: 'unread'; key: string }
  | { kind: 'message'; key: string; message: Message; firstInRun: boolean; lastInRun: boolean };

function dayOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function continues(previous: Message | undefined, message: Message): boolean {
  return (
    !!previous &&
    !isService(previous) &&
    !isService(message) &&
    previous.senderId === message.senderId &&
    message.ts - previous.ts < RUN_WINDOW_MS &&
    dayOf(previous.ts) === dayOf(message.ts)
  );
}

const PEOPLE = new Set(['joined', 'left', 'invited', 'removed', 'banned']);

/**
 * Две служебные строки подряд, говорящие одно и то же про разных людей, — одна строка:
 * «Аня и Борис теперь в чате». Только одинаковое с одинаковым: «вошла» и «вышел» — два
 * разных факта. Уже названный второй раз не добавляется (вышел и вернулся за минуту).
 */
function merged(previous: Message, message: Message): Message | undefined {
  if (previous.kind.type !== 'service' || message.kind.type !== 'service') return undefined;
  const a = previous.kind.event;
  const b = message.kind.event;
  if (a.type !== b.type || !PEOPLE.has(a.type) || !('people' in a) || !('people' in b)) return undefined;
  const people = [...a.people, ...b.people.filter((p) => !a.people.includes(p))];
  return { ...previous, ts: message.ts, kind: { type: 'service', event: { type: a.type, people } as ServiceEvent } };
}

export const UNREAD_DIVIDER_KEY = 'unread-divider';

/**
 * Какие служебные строки лента оставляет за кадром — `ServiceEventSettings` нативной Искры.
 * Два переключателя, потому что это два разных шума: «вошёл» и «вышел» в большой комнате —
 * почти всё, что там происходит; смена имени реже, и из неё узнаёшь, что «Кот» теперь «Аня».
 * Что сделали с самим чатом (название, фото, шифрование) — видно всегда.
 */
export interface ServiceHiding {
  nameChanges: boolean;
  membership: boolean;
}

export const SHOW_ALL_SERVICE: ServiceHiding = { nameChanges: false, membership: false };

export function hides(message: Message, hiding: ServiceHiding): boolean {
  if (message.kind.type !== 'service') return false;
  const type = message.kind.event.type;
  if (type === 'renamedThemselves') return hiding.nameChanges;
  return PEOPLE.has(type) && hiding.membership;
}

/**
 * Полоса заслужена, только если под ней есть что-то чужое. Маркер SDK стоит за последним
 * *событием*, которое аккаунт прочёл, и может оказаться над входом в чат, над пустотой или над
 * своим ответом с другого устройства. «Непрочитанное» над своими словами — это приложение, не
 * знающее, кто вы (`withUnreadDividerIfEarned` нативной Искры).
 */
function earned(messages: readonly Message[], from: number): boolean {
  return messages.slice(from).some((m) => !m.own && !isService(m));
}

/**
 * `unreadFrom` — ключ первого сообщения после маркера прочитанного: над ним встаёт полоса
 * «Непрочитанные сообщения». Она, как дата, рвёт серию.
 */
export function layout(all: readonly Message[], unreadFrom?: string, hiding: ServiceHiding = SHOW_ALL_SERVICE): TimelineItem[] {
  // Спрятанная строка могла быть первой непрочитанной — тогда полоса встаёт над следующей.
  const firstUnread = unreadFrom === undefined ? -1 : all.findIndex((m) => m.key === unreadFrom);
  if (firstUnread >= 0) unreadFrom = all.slice(firstUnread).find((m) => !hides(m, hiding))?.key;
  const messages = all.filter((m) => !hides(m, hiding));
  const unreadAt = unreadFrom === undefined ? -1 : messages.findIndex((m) => m.key === unreadFrom);
  const withDivider = unreadAt >= 0 && earned(messages, unreadAt);
  const items: TimelineItem[] = [];
  let previous: Message | undefined;
  let lastMessageItem: Extract<TimelineItem, { kind: 'message' }> | undefined;
  for (const message of messages) {
    // Склеенная строка держит ключ первой: второй вошедший дописывается в строку, которая
    // уже на экране, а не заменяет её другой.
    const pooled =
      previous && lastMessageItem && dayOf(previous.ts) === dayOf(message.ts) && !(withDivider && message.key === unreadFrom)
        ? merged(previous, message)
        : undefined;
    if (pooled && lastMessageItem) {
      lastMessageItem.message = pooled;
      previous = pooled;
      continue;
    }
    if (!previous || dayOf(previous.ts) !== dayOf(message.ts)) {
      items.push({ kind: 'day', key: `day-${dayOf(message.ts)}`, ts: message.ts });
    }
    const divided = withDivider && message.key === unreadFrom;
    if (divided) items.push({ kind: 'unread', key: UNREAD_DIVIDER_KEY });
    const joined = !divided && continues(previous, message);
    if (lastMessageItem && !joined) lastMessageItem.lastInRun = true;
    lastMessageItem = { kind: 'message', key: message.key, message, firstInRun: !joined, lastInRun: false };
    items.push(lastMessageItem);
    previous = message;
  }
  if (lastMessageItem) lastMessageItem.lastInRun = true;
  return items;
}

/**
 * Сколько чужих сообщений пришло после `lastKey` — число на кнопке «вниз» (Telegram): лента не
 * тащит читающего выше вниз, значит, должна сказать. Своё и служебное не считается; `lastKey`
 * не нашёлся (лента пересобрана целиком) — ничего не пришло.
 */
export function arrivedFromOthers(messages: readonly Message[], lastKey: string | undefined): number {
  if (!lastKey) return 0;
  const from = messages.findIndex((m) => m.key === lastKey) + 1;
  if (from === 0) return 0;
  return messages.slice(from).filter((m) => !m.own && !isService(m)).length;
}
