/**
 * Пересылка — `Forwarded` и `TimelineStore.forward` нативной Искры.
 *
 * В Matrix нет своей пересылки: пересланное — новое сообщение с теми же словами. Пересланным
 * его делает `m.forwarded` в содержимом (MSC2723, снова поднятый MSC4553) — ни один не принят,
 * мало кто его шлёт, но это единственная форма, о которой хоть кто-то договорился. Все поля
 * необязательны.
 *
 * Пометка говорит только *что* это пересылка и когда это было сказано впервые — никогда кто и
 * где. Сообщение может прийти из зашифрованного чата в открытый, и имя автора, его Matrix ID или
 * ID события из закрытой переписки, записанные там, где сервер их читает, выдали бы, кто
 * говорил и что такая переписка есть.
 */
import type { Message } from './message';

/** Откуда пересланное — как говорит само сообщение. */
export interface ForwardOrigin {
  /** Кого назвать: имя, иначе Matrix ID, иначе никого — просто «Пересланное сообщение». */
  name?: string;
  /** Когда сказано впервые, мс. */
  ts?: number;
}

/** `m.forwarded` из содержимого события — или `undefined`, если это не пересылка. */
export function forwardOriginOf(content: Record<string, unknown>): ForwardOrigin | undefined {
  const forwarded = content['m.forwarded'];
  if (!forwarded || typeof forwarded !== 'object') return undefined;
  const record = forwarded as Record<string, unknown>;
  const name = [record['displayname'], record['sender']].find((v): v is string => typeof v === 'string' && v !== '');
  const ts = record['origin_server_ts'];
  return { ...(name ? { name } : {}), ...(typeof ts === 'number' ? { ts } : {}) };
}

/**
 * Что можно переслать: слова, фото, видео и файлы. Голосовое, кружок, место, стикер и опрос —
 * нет: каждому пришлось бы заново выводить свои метаданные, и их никто не пересылает.
 */
export function canForward(message: Message): boolean {
  if (!message.eventId) return false;
  switch (message.kind.type) {
    case 'text':
    case 'notice':
    case 'emote':
      return true;
    case 'image':
    case 'video':
    case 'file':
      return !!message.kind.attachment.source;
    default:
      return false;
  }
}

/**
 * Содержимое `m.room.message`, пересылающее эти слова, — или `null`, если это не слова. Пересылка
 * пересланного указывает время оригинала, а не промежуточной пересылки: «когда это сказали» —
 * то, что хотят знать. Никого не упоминает: передать чужие слова — не позвать их автора, а
 * пустой `m.mentions` не даёт старым правилам принять имя в тексте за упоминание.
 */
export function forwardContent(message: Message): Record<string, unknown> | null {
  const kind = message.kind;
  if (kind.type !== 'text' && kind.type !== 'notice' && kind.type !== 'emote') return null;
  const msgtype = kind.type === 'text' ? 'm.text' : kind.type === 'notice' ? 'm.notice' : 'm.emote';
  const original: Record<string, unknown> = { msgtype, body: kind.body };
  if (kind.html) {
    original['format'] = 'org.matrix.custom.html';
    original['formatted_body'] = kind.html;
  }
  const ts = message.forwarded ? message.forwarded.ts : message.ts;
  const forwarded: Record<string, unknown> = { ...(ts !== undefined ? { origin_server_ts: ts } : {}), content: original };
  return { ...original, 'm.forwarded': forwarded, 'm.mentions': {} };
}
