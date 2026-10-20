/**
 * Все стикеры, которые аккаунт может отправить, — `StickerLibrary` нативной Искры.
 *
 * Откуда они:
 * - **свой набор** (`im.ponies.user_emotes`) — «Мои стикеры», куда стикер добавляют из чата;
 *   тот же набор показывают Element и Cinny;
 * - **наборы чатов по подписке** (`im.ponies.emote_rooms`) — лежат в состоянии своих комнат;
 * - **набор открытого чата** под пустым ключом — так сообщество раздаёт стикеры всем в нём,
 *   никого не прося подписываться;
 * - **«Искорки»** — свои у приложения: картинки загружаются в аккаунт один раз и запоминаются
 *   в его данных (`BUILT_IN_TYPE`), чтобы у получателя был `mxc`.
 *
 * Живёт с сессией, а не с чатом: свой набор и недавние — аккаунта, одинаковы в каждом чате,
 * и добавленный в одном стикер сразу есть в следующем.
 */
import { ClientEvent, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk';
import {
  adding,
  BUILT_IN_TYPE,
  packFrom,
  packId,
  pushing,
  RECENT_TYPE,
  recentContent,
  recentIn,
  removing,
  ROOM_PACK_TYPE,
  stickerFrom,
  subscribing,
  SUBSCRIPTIONS_TYPE,
  subscriptionsIn,
  unsubscribing,
  USER_PACK_TYPE,
  type Sticker,
  type StickerPack,
} from './imagePack';

export type StickerFailure = 'add' | 'remove' | 'subscribe' | 'unsubscribe' | 'clearRecent';

/** Какие наборы показывать — «Отображение стикеров» в настройках, на этом устройстве. */
export interface StickerSources {
  builtIn: boolean;
  roomPack: boolean;
  mine: boolean;
}

/** Картинка «Искорок», как её отдаёт приложение: имя, эмодзи вместо неё и сами байты. */
export interface StickerArt {
  code: string;
  emoji: string;
  load: () => Promise<Blob>;
}

/** Какой набор «Искорок» загружен. Другая картинка — другая версия, и аккаунт загрузит набор заново. */
export const STICKER_ART_VERSION = 2;
/** Сторона каждой «Искорки». 512 — как у Telegram и Element: чётко в любом размере ленты. */
const ART_SIDE = 512;

/** Сколько ждать одного ответа: набор чата на медленном сервере не должен держать свои стикеры. */
const TIMEOUT_MS = 10_000;
/**
 * Сколько записанное этим устройством важнее того, что знает SDK. Свою запись SDK узнаёт,
 * только когда её вернёт синхронизация, — и два стикера, добавленные подряд, без этого
 * добавлялись бы оба к набору *до* первого, а вторая запись выкинула бы первый.
 */
const WRITE_SETTLES_MS = 60_000;

type JSON = Record<string, unknown>;

export class StickerLibrary {
  /** Что показывает панель, в её порядке: свой, набор чата, подписки, «Искорки». Пустые — не показываем. */
  packs = $state.raw<StickerPack[]>([]);
  /** Последние отправленные, свежие первыми. */
  recent = $state.raw<Sticker[]>([]);
  /** Свой набор — даже когда в панели он выключен: по нему решается «Добавить» или «Убрать». */
  mine = $state.raw<StickerPack | null>(null);
  /** Наборы чатов, на которые подписан аккаунт, — по `packId`. */
  subscribed = $state.raw<string[]>([]);
  loading = $state(false);
  loaded = $state(false);
  failure = $state<StickerFailure | null>(null);

  private readonly client: MatrixClient;
  private readonly upload: (blob: Blob, type: string) => Promise<string>;
  private readonly off: () => void;
  private readonly written: Partial<Record<string, { content: JSON; at: number }>> = {};
  private builtIn: Promise<StickerPack | null> | null = null;
  /** Показан ли свой набор в панели — по последнему `load`. */
  private showsMine = false;

  constructor(client: MatrixClient, upload: (blob: Blob, type: string) => Promise<string>) {
    this.client = client;
    this.upload = upload;
    const onAccountData = (event: MatrixEvent) => {
      const type = event.getType();
      if (type === USER_PACK_TYPE) this.show(this.current(USER_PACK_TYPE));
      else if (type === RECENT_TYPE) this.recent = recentIn(event.getContent());
      else if (type === SUBSCRIPTIONS_TYPE) this.subscribed = subscriptionsIn(this.current(SUBSCRIPTIONS_TYPE)).map((s) => packId({ kind: 'room', ...s }));
    };
    client.on(ClientEvent.AccountData, onAccountData);
    this.off = () => client.off(ClientEvent.AccountData, onAccountData);
    this.show(this.current(USER_PACK_TYPE));
    this.recent = recentIn(this.stored(RECENT_TYPE));
  }

  /**
   * Читает всё заново — для открытого чата. При каждом открытии панели, а не раз за сессию:
   * набор — чужой, его меняют, а панель со вчерашними стикерами была бы неправа незаметно.
   */
  async load(roomId: string | null, sources: StickerSources, art: readonly StickerArt[] = []): Promise<void> {
    this.loading = true;
    try {
      const own = packFrom(this.current(USER_PACK_TYPE), { kind: 'mine' });
      this.mine = own;
      this.showsMine = sources.mine;
      const subscriptions = subscriptionsIn(this.current(SUBSCRIPTIONS_TYPE));
      this.subscribed = subscriptions.map((s) => packId({ kind: 'room', ...s }));
      const places: Array<{ roomId: string; stateKey: string }> = [];
      // Набор открытого чата — если настройки не против. Подписка видна всегда: о ней просили.
      if (roomId && sources.roomPack) places.push({ roomId, stateKey: '' });
      for (const place of subscriptions) {
        if (!places.some((p) => p.roomId === place.roomId && p.stateKey === place.stateKey)) places.push(place);
      }
      const roomPacks = (await Promise.all(places.map((p) => this.roomPack(p.roomId, p.stateKey)))).filter((p): p is StickerPack => !!p);
      this.packs = [...(sources.mine ? [own] : []), ...roomPacks].filter((p) => p.stickers.length);
      this.recent = recentIn(this.stored(RECENT_TYPE));
      this.loaded = true;
      // Последними и когда остальные уже на экране: в первый раз это дюжина загрузок.
      if (!sources.builtIn || !art.length) return;
      const builtIn = await this.builtInPack(art);
      if (builtIn?.stickers.length) this.packs = [...this.packs.filter((p) => p.origin.kind !== 'builtIn'), builtIn];
    } finally {
      this.loading = false;
      this.loaded = true;
    }
  }

  isMine(url: string): boolean {
    return !!this.mine?.stickers.some((s) => s.url === url);
  }

  isSubscribed(pack: StickerPack): boolean {
    return this.subscribed.includes(pack.id);
  }

  /** Свой набор пополняется ссылкой: картинка уже на сервере, загружать нечего. */
  async add(sticker: Sticker): Promise<void> {
    if (this.isMine(sticker.url)) return;
    await this.change('add', USER_PACK_TYPE, (content) => adding(sticker, content));
  }

  async remove(sticker: Sticker): Promise<void> {
    if (!this.isMine(sticker.url)) return;
    await this.change('remove', USER_PACK_TYPE, (content) => removing(sticker.url, content));
  }

  /** Подписаться на набор чата — он будет в каждом чате, а не только в своём. */
  async subscribe(pack: StickerPack): Promise<void> {
    const origin = pack.origin;
    if (origin.kind !== 'room' || this.isSubscribed(pack)) return;
    const previous = this.subscribed;
    this.subscribed = [...previous, pack.id];
    if (!(await this.change('subscribe', SUBSCRIPTIONS_TYPE, (content) => subscribing(origin.roomId, origin.stateKey, content)))) this.subscribed = previous;
  }

  /** Отписаться. Сам набор — чата, и остаётся в нём. */
  async unsubscribe(pack: StickerPack): Promise<void> {
    const origin = pack.origin;
    if (origin.kind !== 'room' || !this.isSubscribed(pack)) return;
    const previous = { subscribed: this.subscribed, packs: this.packs };
    this.subscribed = previous.subscribed.filter((id) => id !== pack.id);
    this.packs = previous.packs.filter((p) => p.id !== pack.id);
    if (!(await this.change('unsubscribe', SUBSCRIPTIONS_TYPE, (content) => unsubscribing(origin.roomId, origin.stateKey, content)))) {
      this.subscribed = previous.subscribed;
      this.packs = previous.packs;
    }
  }

  /** Очистить недавние — на всех устройствах: они в аккаунте. */
  async clearRecent(): Promise<void> {
    const previous = this.recent;
    this.recent = [];
    try {
      await this.write(RECENT_TYPE, { images: [] });
    } catch {
      this.recent = previous;
      this.failure = 'clearRecent';
    }
  }

  /** Стикер только что ушёл — в недавние. Не записалось — не беда: стикер ушёл, а ряд — удобство. */
  used(sticker: Sticker): void {
    this.recent = pushing(sticker, this.recent);
    this.write(RECENT_TYPE, recentContent(this.recent)).catch(() => {});
  }

  dismissFailure(): void {
    this.failure = null;
  }

  destroy(): void {
    this.off();
  }

  // ————— Внутри —————

  /**
   * Правка данных аккаунта по свежему JSON. До первой синхронизации их не знает и SDK — а
   * «пусто», записанное обратно, стёрло бы весь набор человека. Поэтому тогда не пишем.
   */
  private async change(failure: StickerFailure, type: string, edit: (content: JSON) => JSON): Promise<boolean> {
    this.failure = null;
    try {
      if (!this.client.isInitialSyncComplete()) throw new Error('not synced');
      const next = edit(this.current(type));
      await this.write(type, next);
      this.written[type] = { content: next, at: Date.now() };
      if (type === USER_PACK_TYPE) this.show(next);
      return true;
    } catch {
      this.failure = failure;
      return false;
    }
  }

  /** Данные аккаунта из хранилища SDK — или то, что записало это устройство, если синхронизация его ещё не вернула. */
  private current(type: string): JSON {
    const stored = this.stored(type);
    const written = this.written[type];
    if (!written || Date.now() - written.at > WRITE_SETTLES_MS) {
      delete this.written[type];
      return stored;
    }
    if (JSON.stringify(stored) === JSON.stringify(written.content)) delete this.written[type];
    return written.content;
  }

  private stored(type: string): JSON {
    const content = this.client.getAccountData(type as never)?.getContent();
    return content && typeof content === 'object' ? (content as JSON) : {};
  }

  private write(type: string, content: JSON): Promise<unknown> {
    return withTimeout(this.client.setAccountData(type as never, content as never), TIMEOUT_MS);
  }

  private show(content: JSON): void {
    const pack = packFrom(content, { kind: 'mine' });
    this.mine = pack;
    if (!this.showsMine) return;
    const rest = this.packs.filter((p) => p.origin.kind !== 'mine');
    this.packs = pack.stickers.length ? [pack, ...rest] : rest;
  }

  /**
   * Набор чата или ничего: нет набора, чат чужой, сервер не ответил — не забота человека.
   * Свой чат — из состояния, которое уже пришло синхронизацией; чужой — спросить сервер.
   */
  private async roomPack(roomId: string, stateKey: string): Promise<StickerPack | null> {
    const origin = { kind: 'room' as const, roomId, stateKey };
    const room = this.client.getRoom(roomId);
    if (room?.getMyMembership() === 'join') {
      const event = room.currentState.getStateEvents(ROOM_PACK_TYPE, stateKey);
      return event ? packFrom(event.getContent(), origin) : null;
    }
    try {
      return packFrom(await withTimeout(this.client.getStateEvent(roomId, ROOM_PACK_TYPE, stateKey), TIMEOUT_MS), origin);
    } catch {
      return null;
    }
  }

  /** «Искорки» с адресами на сервере аккаунта. Пустой набор не запоминается — в следующий раз попробуем снова. */
  private async builtInPack(art: readonly StickerArt[]): Promise<StickerPack | null> {
    this.builtIn ??= this.makeBuiltIn(art);
    const pack = await this.builtIn;
    if (!pack?.stickers.length) this.builtIn = null;
    return pack;
  }

  /**
   * В первый раз каждая картинка загружается — открыто, это картинка, которую любое приложение
   * рисует одинаково, — и где она легла, пишется в `BUILT_IN_TYPE`. Дальше, на любом устройстве
   * аккаунта, адреса читаются оттуда. Не загрузившееся просто не входит в набор до следующего раза.
   */
  private async makeBuiltIn(art: readonly StickerArt[]): Promise<StickerPack | null> {
    const stored = this.stored(BUILT_IN_TYPE);
    const fresh = stored['version'] === STICKER_ART_VERSION;
    const images: JSON = fresh && stored['images'] && typeof stored['images'] === 'object' ? { ...(stored['images'] as JSON) } : {};
    const missing = art.filter((a) => !stickerFrom(images[a.code], a.code));
    if (missing.length) {
      const uploaded = await Promise.all(
        missing.map(async (a) => {
          try {
            const blob = await a.load();
            const url = await withTimeout(this.upload(blob, 'image/png'), TIMEOUT_MS);
            return { a, url, size: blob.size };
          } catch {
            return null;
          }
        }),
      );
      for (const item of uploaded) {
        if (!item) continue;
        images[item.a.code] = { url: item.url, body: item.a.emoji, usage: ['sticker'], info: { w: ART_SIDE, h: ART_SIDE, mimetype: 'image/png', size: item.size } };
      }
      if (uploaded.some(Boolean)) {
        await this.write(BUILT_IN_TYPE, { version: STICKER_ART_VERSION, pack: { usage: ['sticker'] }, images }).catch(() => {});
      }
    }
    // В порядке рисования, а не по имени: первым — «привет».
    const stickers = art.flatMap((a) => stickerFrom(images[a.code], a.code) ?? []);
    return { id: packId({ kind: 'builtIn' }), origin: { kind: 'builtIn' }, ...(stickers[0] ? { icon: stickers[0] } : {}), stickers };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
