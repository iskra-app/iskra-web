/**
 * Несколько сообщений сразу — «Выбрать» Telegram и `MessageSelection` нативной Искры.
 *
 * Что делать с выбранными — всегда в порядке ленты, а не нажатий: пересылка или копия в порядке
 * касаний была бы перемешанной перепиской.
 */
import type { Message } from './message';
import { wordsOf } from './words';

/** Можно ли выбрать: ушедшее, не удалённое и не служебное. Не ушедшее — своё меню, «Отправить заново». */
export function isSelectable(message: Message): boolean {
  return !!message.eventId && message.delivery.state !== 'failed' && message.kind.type !== 'deleted' && message.kind.type !== 'service';
}

/** Выбранные — сверху вниз, как в ленте. */
export function inTimelineOrder(messages: readonly Message[], keys: ReadonlySet<string>): Message[] {
  return messages.filter((m) => keys.has(m.key));
}

/** Слова сообщения: текст — без значков разметки, у фото и файла — подпись. */
function wordsIn(message: Message): string | undefined {
  const kind = message.kind;
  if (kind.type === 'text' || kind.type === 'notice' || kind.type === 'emote') return wordsOf(kind.body, kind.html);
  if ('attachment' in kind) return kind.attachment.caption;
  return undefined;
}

/**
 * Что «Скопировать» кладёт в буфер. Одно сообщение — его слова, как копирует его же меню.
 * Несколько — стенограмма: кто, когда, что, — иначе строки, вставленные где-то ещё, уже не
 * говорят, кто что сказал. У фото — подпись; без подписи — ничего. Нечего — `null`.
 */
export function selectionTranscript(messages: readonly Message[], stamp: (ts: number) => string): string | null {
  const said = messages.flatMap((message) => {
    const words = wordsIn(message);
    return words ? [{ message, words }] : [];
  });
  if (said.length === 0) return null;
  if (said.length === 1) return said[0]!.words;
  return said.map(({ message, words }) => `${message.senderName}, [${stamp(message.ts)}]\n${words}`).join('\n\n');
}
