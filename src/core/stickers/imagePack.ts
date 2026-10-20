/**
 * Стикеры — MSC2545, формат наборов, который читают Element, Cinny, FluffyChat и Nheko; порт
 * `StickerPack.swift` нативной Искры.
 *
 * Магазина стикеров в Matrix нет. Набор — JSON картинок по коротким именам: свой — в данных
 * аккаунта (`im.ponies.user_emotes`, «Мои стикеры»), набор чата — в его состоянии
 * (`im.ponies.room_emotes`), и на него подписываются, перечисляя комнату в
 * `im.ponies.emote_rooms`. Стикер — это `mxc://` с описанием и размером; отправить его —
 * сослаться на этот адрес.
 *
 * Поэтому картинка набора не зашифрована и не может быть: её читают все, с кем набор
 * поделён, во всех чатах, куда её шлют, и ключа им никто не даст.
 *
 * Правки — только по *сырому* JSON, никогда по разобранной копии. Свой набор общий для всех
 * клиентов человека, и в нём не только стикеры: свои эмодзи (`usage: ["emoticon"]`) и поля,
 * о которых это приложение не слышало. Набор, разобранный в список стикеров и записанный
 * обратно, тихо стёр бы всё это со всех устройств аккаунта.
 */
import type { Attachment } from '../timeline/message';

export const USER_PACK_TYPE = 'im.ponies.user_emotes';
export const ROOM_PACK_TYPE = 'im.ponies.room_emotes';
export const SUBSCRIPTIONS_TYPE = 'im.ponies.emote_rooms';
/** Последние отправленные — в аккаунте, чтобы на ноутбуке первыми были те, что слали с телефона. */
export const RECENT_TYPE = 'moscow.swag.iskra.recent_stickers';
/** Где лежат загруженные «Искорки» — набор по форме, но под своим типом: в списке эмодзи Element ему не место. */
export const BUILT_IN_TYPE = 'moscow.swag.iskra.builtin_stickers';
export const RECENT_LIMIT = 16;

type JSON = Record<string, unknown>;

export interface Sticker {
  /** `mxc://` — единственное, чем два стикера различаются: одна картинка в двух наборах — один стикер. */
  url: string;
  /** Имя в наборе, уникальное в нём: `hug`, `cat_lol`. */
  shortcode: string;
  /** Слова вместо картинки — `body` события, то, что прочтёт экранный диктор. Обычно эмодзи. */
  body: string;
  width?: number;
  height?: number;
  mimetype?: string;
  size?: number;
}

export type PackOrigin = { kind: 'mine' } | { kind: 'room'; roomId: string; stateKey: string } | { kind: 'builtIn' };

export interface StickerPack {
  id: string;
  origin: PackOrigin;
  /** Как набор себя называет, если называет. Свой обычно нет — его называет экран. */
  name?: string;
  /** Картинка на вкладке: своя у набора или его первый стикер. */
  icon?: Sticker;
  stickers: Sticker[];
}

export function packId(origin: PackOrigin): string {
  if (origin.kind === 'room') return `${origin.roomId}/${origin.stateKey}`;
  return origin.kind;
}

const isObject = (value: unknown): value is JSON => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): string[] | undefined => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined);
/** Размер из JavaScript-клиента часто приходит как `512.0` — тоже число. */
const integer = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined);

/** Одна картинка набора. `body` по MSC по умолчанию — короткое имя. */
export function stickerFrom(image: unknown, shortcode: string): Sticker | undefined {
  if (!isObject(image)) return undefined;
  const url = image['url'];
  if (typeof url !== 'string' || !url.startsWith('mxc://')) return undefined;
  const info = isObject(image['info']) ? image['info'] : {};
  const body = typeof image['body'] === 'string' && image['body'] ? image['body'] : shortcode;
  const sticker: Sticker = { url, shortcode, body };
  const w = integer(info['w']);
  const h = integer(info['h']);
  if (w && h) {
    sticker.width = w;
    sticker.height = h;
  }
  if (typeof info['mimetype'] === 'string') sticker.mimetype = info['mimetype'];
  const size = integer(info['size']);
  if (size !== undefined) sticker.size = size;
  return sticker;
}

const byShortcode = new Intl.Collator(undefined, { numeric: true });

/**
 * Стикеры набора — что помечено для стикеров явно или не помечено никак. `usage` картинки
 * важнее `usage` набора; набор, не сказавший ни того ни другого, годится в оба (по MSC).
 * По короткому имени: у объекта JSON нет порядка, а набор, перетасованный при каждом
 * открытии, ставил бы каждый стикер на новое место.
 */
export function stickersIn(content: unknown): Sticker[] {
  if (!isObject(content)) return [];
  const packUsage = isObject(content['pack']) ? strings(content['pack']['usage']) : undefined;
  const images = isObject(content['images']) ? content['images'] : {};
  const out: Sticker[] = [];
  for (const [shortcode, image] of Object.entries(images)) {
    if (!isObject(image)) continue;
    const usage = strings(image['usage']) ?? packUsage;
    if (usage && !usage.includes('sticker')) continue;
    const sticker = stickerFrom(image, shortcode);
    if (sticker) out.push(sticker);
  }
  return out.sort((a, b) => byShortcode.compare(a.shortcode, b.shortcode));
}

export function packFrom(content: unknown, origin: PackOrigin): StickerPack {
  const pack = isObject(content) && isObject(content['pack']) ? content['pack'] : {};
  const name = typeof pack['display_name'] === 'string' && pack['display_name'] ? pack['display_name'] : undefined;
  const avatar = typeof pack['avatar_url'] === 'string' && pack['avatar_url'].startsWith('mxc://') ? pack['avatar_url'] : undefined;
  const stickers = stickersIn(content);
  const icon = avatar ? { url: avatar, shortcode: '', body: name ?? '' } : stickers[0];
  return { id: packId(origin), origin, ...(name ? { name } : {}), ...(icon ? { icon } : {}), stickers };
}

/** `info` — как его пишут и набор, и событие `m.sticker`. */
export function infoOf(sticker: Sticker): JSON {
  const info: JSON = {};
  if (sticker.width) info['w'] = sticker.width;
  if (sticker.height) info['h'] = sticker.height;
  if (sticker.mimetype) info['mimetype'] = sticker.mimetype;
  if (sticker.size) info['size'] = sticker.size;
  return info;
}

/**
 * Содержимое `m.sticker`. `info` — даже пустой: спецификация требует, а Element рисует стикер
 * без `w`/`h` своим размером.
 */
export function stickerContent(sticker: Sticker, replyTo?: string): JSON {
  const content: JSON = { body: sticker.body, url: sticker.url, info: infoOf(sticker) };
  if (replyTo) content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyTo } };
  return content;
}

/**
 * Свой набор с этим стикером — и со всем, что в нём было. Картинка помечается `["sticker"]`
 * сама: иначе в наборе с `usage: emoticon` новый стикер стал бы эмодзи в композере Element.
 */
export function adding(sticker: Sticker, content: JSON): JSON {
  const images = isObject(content['images']) ? content['images'] : {};
  if (Object.values(images).some((image) => isObject(image) && image['url'] === sticker.url)) return content;
  const code = shortcodeFor(sticker.body, new Set(Object.keys(images)));
  const image: JSON = { url: sticker.url, usage: ['sticker'] };
  if (sticker.body) image['body'] = sticker.body;
  const info = infoOf(sticker);
  if (Object.keys(info).length) image['info'] = info;
  return { ...content, images: { ...images, [code]: image } };
}

/** Свой набор без этой картинки — все записи с ней: одна картинка под двумя именами — всё равно один стикер. */
export function removing(url: string, content: JSON): JSON {
  if (!isObject(content['images'])) return content;
  const images = Object.fromEntries(Object.entries(content['images']).filter(([, image]) => !(isObject(image) && image['url'] === url)));
  return { ...content, images };
}

/**
 * Короткое имя для стикера, у которого есть только описание. MSC запрещает пробелы и
 * двоеточия (имя пишут как `:code:`), так что остаются буквы, цифры, `-` и `_`. Описание из
 * одних эмодзи — а таких большинство — даёт `sticker`. Потом номер, пока имя не свободно.
 */
export function shortcodeFor(body: string, taken: ReadonlySet<string>): string {
  const kept = [...body.toLowerCase().replaceAll(' ', '_')].filter((c) => /[\p{L}\p{N}_-]/u.test(c)).join('');
  const stem = [...kept].slice(0, 32).join('') || 'sticker';
  if (!taken.has(stem)) return stem;
  let n = 2;
  while (taken.has(`${stem}_${n}`)) n++;
  return `${stem}_${n}`;
}

/** На какие наборы чатов подписан аккаунт: `{"rooms": {"!room": {"state_key": {}}}}`. */
export function subscriptionsIn(content: unknown): Array<{ roomId: string; stateKey: string }> {
  const rooms = isObject(content) && isObject(content['rooms']) ? content['rooms'] : {};
  const out: Array<{ roomId: string; stateKey: string }> = [];
  for (const [roomId, keys] of Object.entries(rooms)) {
    if (!isObject(keys)) continue;
    for (const stateKey of Object.keys(keys)) out.push({ roomId, stateKey });
  }
  return out.sort((a, b) => (a.roomId === b.roomId ? (a.stateKey < b.stateKey ? -1 : 1) : a.roomId < b.roomId ? -1 : 1));
}

export function subscribing(roomId: string, stateKey: string, content: JSON): JSON {
  const rooms = isObject(content['rooms']) ? content['rooms'] : {};
  const keys = isObject(rooms[roomId]) ? rooms[roomId] : {};
  if (stateKey in keys) return content;
  return { ...content, rooms: { ...rooms, [roomId]: { ...keys, [stateKey]: {} } } };
}

/** Без этого набора. Комната, где не осталось наборов, уходит тоже — пустой объект никому не нужен. */
export function unsubscribing(roomId: string, stateKey: string, content: JSON): JSON {
  const rooms = isObject(content['rooms']) ? { ...content['rooms'] } : undefined;
  const keys = rooms && isObject(rooms[roomId]) ? { ...rooms[roomId] } : undefined;
  if (!rooms || !keys) return content;
  delete keys[stateKey];
  if (Object.keys(keys).length) rooms[roomId] = keys;
  else delete rooms[roomId];
  return { ...content, rooms };
}

export function pushing(sticker: Sticker, recent: readonly Sticker[]): Sticker[] {
  return [sticker, ...recent.filter((s) => s.url !== sticker.url)].slice(0, RECENT_LIMIT);
}

export function recentIn(content: unknown): Sticker[] {
  const images = isObject(content) && Array.isArray(content['images']) ? content['images'] : [];
  return images.flatMap((image) => stickerFrom(image, '') ?? []);
}

export function recentContent(recent: readonly Sticker[]): JSON {
  return {
    images: recent.map((sticker) => {
      const info = infoOf(sticker);
      return { url: sticker.url, body: sticker.body, ...(Object.keys(info).length ? { info } : {}) };
    }),
  };
}

/** Картинка стикера — в той форме, которую уже понимает всё, что рисует вложения. */
export function stickerAttachment(sticker: Sticker): Attachment {
  return {
    name: 'sticker',
    ...(sticker.body ? { caption: sticker.body } : {}),
    ...(sticker.width && sticker.height ? { width: sticker.width, height: sticker.height } : {}),
    ...(sticker.mimetype ? { mimetype: sticker.mimetype } : {}),
    source: { mxc: sticker.url },
  };
}

/**
 * Стикер из пришедшего — чтобы положить в свой набор: та же картинка, то же описание. Только
 * открытый файл: зашифрованный указывает на шифротекст, ключ от которого был в одном
 * событии, — в наборе его не нарисовал бы никто, даже этот аккаунт на другом устройстве.
 */
export function stickerOf(attachment: Attachment): Sticker | undefined {
  const source = attachment.source;
  if (!source || source.encryption || !source.mxc.startsWith('mxc://')) return undefined;
  return {
    url: source.mxc,
    shortcode: '',
    body: attachment.caption ?? (attachment.name && attachment.name !== 'sticker' ? attachment.name : ''),
    ...(attachment.width && attachment.height ? { width: attachment.width, height: attachment.height } : {}),
    ...(attachment.mimetype ? { mimetype: attachment.mimetype } : {}),
  };
}

/**
 * Рисуется ли картинка стикером — принимающая половина правила, и единственное место, где оно
 * записано (`StickerPicture.isSticker` нативной). WebP — как бы ни пришёл; или картинка, которую
 * приложение отправило *как* стикер, назвав `sticker.<ext>`: в зашифрованном чате стикер уходит
 * зашифрованным `m.image`, потому что `m.sticker` открыл бы картинку серверу.
 */
export function isStickerImage(mimetype: string | undefined, filename: string | undefined): boolean {
  if (mimetype?.toLowerCase() === 'image/webp') return true;
  const name = filename?.toLowerCase();
  return !!name && /^sticker\.(png|webp|gif)$/.test(name);
}
