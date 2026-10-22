/**
 * Поиск по сообщениям: кто кладёт в индекс и кто спрашивает — `SearchStore` и
 * `RoomSearchStore` нативной Искры.
 *
 * Индекс пополняется тем, что клиент видит: пришло с синхронизацией, догрузилось листанием
 * назад, расшифровалось позже. Правка заменяет слова сообщения, удаление убирает его из
 * индекса. Старую историю, которую на этом устройстве ни разу не открывали, найти нельзя —
 * её здесь не было; так же и в нативной.
 *
 * Удалённое сообщение не находится никогда, даже если индекс не успел о нём узнать: найденное
 * сверяется с тем, что SDK знает о событии сейчас (`stillThere`).
 */
import {
  ClientEvent,
  EventStatus,
  EventType,
  MatrixEventEvent,
  MsgType,
  RelationType,
  RoomEvent,
  SyncState,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from 'matrix-js-sdk';
import { previewOf } from '../rooms/preview';
import { SearchIndex, type IndexEntry } from './searchIndex';
import { MIN_QUERY } from './terms';

export interface SearchHit {
  /** ID события — к нему и ведёт нажатие. */
  id: string;
  roomId: string;
  senderName: string;
  excerpt: string;
  timestamp: number;
}

/** Как назвать отправителя: локальное имя собеседника, имя в чате или ID. */
export type SenderName = (roomId: string, senderId: string) => string;

/** Сколько ждать, пока человек допечатает, — как в нативной. */
const SETTLE_MS = 200;
/** Сколько копить записи перед одной транзакцией. */
const FLUSH_MS = 300;
const LIMIT = 50;

/** Слова сообщения, по которым его можно найти. `undefined` — искать в нём нечего. */
export function searchableText(event: MatrixEvent): string | undefined {
  if (event.getType() !== EventType.RoomMessage || event.isRedacted()) return undefined;
  // Правка — не сообщение: её слова попадают в индекс через правленое (`getContent` учитывает её).
  if (event.getWireContent()['m.relates_to']?.rel_type === RelationType.Replace) return undefined;
  const preview = previewOf(event);
  if (!preview) return undefined;
  if (preview.kind === 'text') return preview.text;
  if (preview.text) return preview.text;
  if (preview.kind === 'file') {
    const content = event.getContent<{ body?: unknown; filename?: unknown; msgtype?: string }>();
    const name = typeof content.filename === 'string' ? content.filename : content.body;
    return content.msgtype === MsgType.File && typeof name === 'string' ? name : undefined;
  }
  return undefined;
}

const LEFT = new Set(['leave', 'ban']);

export class MessageIndexer {
  private index: Promise<SearchIndex | null>;
  /** Что записать (`IndexEntry`) или стереть (`null`) — по ID события. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- очередь, не состояние экрана
  private readonly queue = new Map<string, IndexEntry | null>();
  /** Комнаты, из которых ушли, — их записи стереть целиком. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- очередь, не состояние экрана
  private readonly leftRooms = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flushing: Promise<void> = Promise.resolve();
  private readonly detach: Array<() => void> = [];
  private backfilled = false;
  private destroyed = false;

  constructor(
    private readonly client: MatrixClient,
    /** Имя базы; `null` — IndexedDB нет, поиск молчит. */
    private readonly name: string | null,
  ) {
    this.index = this.open();
    this.listen();
    if (client.isInitialSyncComplete()) this.backfill();
  }

  private open(): Promise<SearchIndex | null> {
    if (!this.name || typeof indexedDB === 'undefined') return Promise.resolve(null);
    return SearchIndex.open(this.name).catch(() => null);
  }

  private on(event: string, handler: (...args: never[]) => void): void {
    const target = this.client as unknown as { on(e: string, h: unknown): void; off(e: string, h: unknown): void };
    target.on(event, handler);
    this.detach.push(() => target.off(event, handler));
  }

  private listen(): void {
    this.on(RoomEvent.Timeline, (event: MatrixEvent, room: Room | undefined) => this.consider(event, room));
    this.on(MatrixEventEvent.Decrypted, (event: MatrixEvent) => this.consider(event));
    this.on(MatrixEventEvent.Replaced, (event: MatrixEvent) => this.consider(event));
    this.on(RoomEvent.LocalEchoUpdated, (event: MatrixEvent) => this.consider(event));
    this.on(RoomEvent.Redaction, (redaction: MatrixEvent) => {
      const target = redaction.event.redacts ?? (redaction.getContent()['redacts'] as string | undefined);
      if (target) this.enqueue(target, null);
    });
    // Ушли из комнаты (вышли, выгнали) — её переписка больше не находится: чата нет в списке, и
    // вести в него поиску незачем.
    this.on(RoomEvent.MyMembership, (room: Room, membership: string) => {
      if (!LEFT.has(membership) || this.destroyed) return;
      for (const [id, entry] of this.queue) if (entry?.roomId === room.roomId) this.queue.delete(id);
      this.leftRooms.add(room.roomId);
      this.schedule();
    });
    this.on(ClientEvent.Sync, (state: SyncState) => {
      if (state === SyncState.Prepared) this.backfill();
    });
  }

  /** Всё, что уже лежит в лентах, — один раз за сессию: кэш синхронизации пришёл без событий. */
  private backfill(): void {
    if (this.backfilled) return;
    this.backfilled = true;
    for (const room of this.client.getRooms()) {
      for (const event of room.getLiveTimeline().getEvents()) this.consider(event, room);
    }
  }

  private consider(event: MatrixEvent, known?: Room): void {
    const id = event.getId();
    // Из `/messages` событие может прийти без `room_id` — комнату тогда знает тот, кто прислал.
    const roomId = event.getRoomId() ?? known?.roomId;
    if (!id || !roomId || this.destroyed) return;
    // Удаление — сам по себе повод стереть, даже если удалённого нет в загруженной ленте:
    // SDK тогда не скажет `RoomEvent.Redaction`, а в индексе оно лежит.
    if (event.isRedaction()) {
      const target = event.event.redacts ?? (event.getContent()['redacts'] as string | undefined);
      if (target) this.enqueue(target, null);
      return;
    }
    const room = known ?? this.client.getRoom(roomId);
    if (room && LEFT.has(room.getMyMembership())) return;
    // Своё, ещё не ушедшее: у него временный ID, а настоящий придёт с эхом.
    if (event.status !== null && event.status !== EventStatus.SENT) return;
    const relation = event.getWireContent()['m.relates_to'] as { rel_type?: string; event_id?: string } | undefined;
    if (relation?.rel_type === RelationType.Replace) {
      // Правка: переписать правленое — каким его теперь видно.
      const original = relation.event_id ? room?.findEventById(relation.event_id) : undefined;
      if (original && original !== event) this.consider(original, room ?? undefined);
      return;
    }
    if (event.isRedacted()) {
      this.enqueue(id, null);
      return;
    }
    const text = searchableText(event);
    if (text === undefined) return;
    this.enqueue(id, { eventId: id, roomId, ts: event.getTs(), sender: event.getSender() ?? '', text });
  }

  private enqueue(id: string, entry: IndexEntry | null): void {
    this.queue.set(id, entry);
    this.schedule();
  }

  private schedule(): void {
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, FLUSH_MS);
  }

  /** Записать накопленное. Индекс не открылся — записи просто пропадают: поиск без них. */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const batch = [...this.queue];
    const left = [...this.leftRooms];
    this.queue.clear();
    this.leftRooms.clear();
    if (!batch.length && !left.length) return this.flushing;
    this.flushing = this.flushing.then(async () => {
      const index = await this.index;
      if (!index) return;
      const entries = batch.flatMap(([, entry]) => (entry ? [entry] : []));
      const removed = batch.flatMap(([id, entry]) => (entry ? [] : [id]));
      await index.put(entries).catch(() => {});
      await index.remove(removed).catch(() => {});
      for (const roomId of left) await index.removeRoom(roomId).catch(() => {});
    });
    return this.flushing;
  }

  /** Найдено и всё ещё есть: удалённое из индекса могло не уйти, но показано не будет. */
  private stillThere(entry: IndexEntry): boolean {
    const event = this.client.getRoom(entry.roomId)?.findEventById(entry.eventId);
    return !event?.isRedacted();
  }

  async search(query: string, roomId?: string): Promise<IndexEntry[]> {
    await this.flush();
    const index = await this.index;
    if (!index) return [];
    const found = await index.search(query, { ...(roomId ? { roomId } : {}), limit: LIMIT });
    return found.filter((entry) => this.stillThere(entry));
  }

  async size(): Promise<number> {
    await this.flush();
    const index = await this.index;
    return index ? index.size().catch(() => 0) : 0;
  }

  /**
   * Стереть индекс. Он соберётся заново из того, что откроют и пролистают, — как в нативной.
   * Новый индекс — с новыми ключами.
   */
  async clear(): Promise<void> {
    this.queue.clear();
    await this.flushing;
    (await this.index)?.close();
    if (this.name) await SearchIndex.destroy(this.name);
    this.index = this.open();
    this.backfilled = false;
    this.backfill();
  }

  destroy(): void {
    this.destroyed = true;
    for (const off of this.detach.splice(0)) off();
    if (this.timer) clearTimeout(this.timer);
    void this.index.then((index) => index?.close());
  }
}

/**
 * Поиск, как человек его видит: печатает — ждём паузы, спрашиваем; пока спрашиваем, новое
 * слово отменяет прежний вопрос. «Ничего не нашлось» — только про законченный поиск.
 */
export class MessageSearch {
  hits = $state.raw<SearchHit[]>([]);
  searching = $state(false);
  foundNothing = $state(false);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;

  constructor(
    private readonly indexer: MessageIndexer,
    private readonly senderName: SenderName,
    private readonly roomId?: string,
  ) {}

  search(query: string): void {
    const generation = ++this.generation;
    if (this.timer) clearTimeout(this.timer);
    const trimmed = query.trim();
    if ([...trimmed].length < MIN_QUERY) {
      this.hits = [];
      this.searching = false;
      this.foundNothing = false;
      return;
    }
    this.searching = true;
    this.foundNothing = false;
    this.timer = setTimeout(() => void this.run(trimmed, generation), SETTLE_MS);
  }

  private async run(query: string, generation: number): Promise<void> {
    const found = await this.indexer.search(query, this.roomId).catch(() => []);
    // Пока искали, человек напечатал дальше — ответ не про то, что в поле.
    if (generation !== this.generation) return;
    this.hits = found.map((entry) => ({
      id: entry.eventId,
      roomId: entry.roomId,
      senderName: this.senderName(entry.roomId, entry.sender),
      excerpt: entry.text,
      timestamp: entry.ts,
    }));
    this.foundNothing = this.hits.length === 0;
    this.searching = false;
  }

  clear(): void {
    this.search('');
  }

  destroy(): void {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
  }
}
