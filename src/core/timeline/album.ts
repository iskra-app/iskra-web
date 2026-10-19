/**
 * Фото и видео, отправленные вместе, — одним пузырём, альбомом Telegram (`Album` нативной).
 *
 * В Matrix альбома нет: каждое фото — своё событие, а предложение, которое связало бы их
 * (MSC4274), — черновик, который никто не шлёт. Поэтому альбом решается здесь, на стороне
 * получателя, по тому, что события говорят: один человек, картинка за картинкой, ничего между,
 * *почти в один момент*. Шесть фото, выбранных разом, уходят из очереди одно за другим и
 * приходят с разницей в секунды; те же шесть, отправленные за обед, — шесть сообщений.
 *
 * Промежуток меряется между соседями, а не от первой до последней: очередь грузит по одному
 * файлу, и на медленной сети десять фото идут минуту, хотя соседние — в секундах друг от друга.
 *
 * Альбом — строка, и строка — его **первое** сообщение: его ключ, его место, на него ложатся
 * реакция, ответ и закреп; все сообщения — в `album`. Первое, а не последнее: ключ строки не
 * должен меняться, пока догружается остальное.
 *
 * Рвёт альбом: что-то между, другой день, полоса «непрочитанные», стикер или «кружочек» (это
 * отдельные сообщения), ответ или подпись где угодно, кроме первого, пересланное.
 */
import type { Delivery, Message } from './message';

/** Самая длинная пауза между двумя картинками одного альбома. */
export const ALBUM_GAP_MS = 15_000;
/** Предел Telegram и выбора файлов: десять в альбоме. */
export const ALBUM_LIMIT = 10;

const isPicture = (m: Message): boolean => m.kind.type === 'image' || m.kind.type === 'video';

const captionOf = (m: Message): string | undefined =>
  m.kind.type === 'image' || m.kind.type === 'video' ? m.kind.attachment.caption : undefined;

const dayOf = (ts: number) => new Date(ts).toDateString();

function belongs(message: Message, last: Message, run: readonly Message[], breakBefore: string | undefined): boolean {
  return (
    run.length < ALBUM_LIMIT &&
    message.key !== breakBefore &&
    message.senderId === last.senderId &&
    !message.replyTo &&
    // Подпись открывает альбом; подпись дальше — начало следующего.
    !captionOf(message) &&
    !message.forwarded &&
    Math.abs(message.ts - last.ts) <= ALBUM_GAP_MS &&
    dayOf(message.ts) === dayOf(last.ts)
  );
}

/** Ниже — меньше прошло. Сбой важнее всего: одно не ушедшее фото — это не ушедший альбом. */
const rank = (d: Delivery) => (d.state === 'failed' ? 0 : d.state === 'sending' ? 1 : 2);

/**
 * Первое сообщение в одежде всего альбома: подпись — его, доставка — как у самой отстающей
 * картинки, «прочитано» и «глаз» — если хоть у одной.
 */
function folded(run: Message[]): Message {
  const lead = run[0]!;
  const delivery = run.map((m) => m.delivery).reduce((worst, d) => (rank(d) < rank(worst) ? d : worst), lead.delivery);
  return {
    ...lead,
    album: run,
    delivery,
    read: run.every((m) => m.read),
    readMark: run.some((m) => m.readMark),
    // Удалить альбом можно, только если можно удалить каждую его картинку.
    canDelete: run.every((m) => m.canDelete),
  };
}

/** Сообщения с каждым альбомом, свёрнутым в первое. `breakBefore` — ключ, над которым полоса. */
export function foldAlbums(messages: readonly Message[], breakBefore?: string): Message[] {
  const result: Message[] = [];
  let run: Message[] = [];
  const flush = () => {
    if (run.length) result.push(run.length === 1 ? run[0]! : folded(run));
    run = [];
  };
  for (const message of messages) {
    if (!isPicture(message)) {
      flush();
      result.push(message);
      continue;
    }
    const last = run.at(-1);
    if (last && !belongs(message, last, run, breakBefore)) flush();
    run.push(message);
  }
  flush();
  return result;
}

/** Все сообщения строки — альбома или одно. */
export const membersOf = (m: Message): Message[] => m.album ?? [m];
