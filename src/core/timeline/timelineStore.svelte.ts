/**
 * `TimelineStore` — лента одной комнаты.
 *
 * **Живая лента начинается пустой, а историю надо попросить.** В нативной Искре это
 * ломалось: история приходила побочным эффектом отрисовки спиннера, и удаление спиннера
 * опустошило все чаты. Здесь история просится явно — `fill(needsMore)` в цикле, пока экран
 * говорит «мало», — а прокрутка просит *следующие* страницы (`loadMore`); первую она
 * попросить не может. Условие цикла — высота содержимого против высоты окна, и его знает
 * экран, а не ядро: ядро не знает, телефон это или монитор в 1440 пикселей.
 *
 * И уроки оттуда же:
 * - Одна страница в полёте, и никогда две. Кто пришёл за страницей, пока летит чужая, ждёт
 *   её, а не уходит ни с чем, — и цикл считает «дождался» отдельно от «принёс».
 * - Неудачная страница — не страница: цикл, съевший бюджет на ошибках, не должен
 *   отдать пустой чат как «загрузили».
 * - Поколение: ответ, пришедший после сброса ленты, не пишет в новую ленту.
 */
import {
  ClientEvent,
  Direction,
  EventStatus,
  EventType,
  MatrixEvent,
  MatrixEventEvent,
  RelationType,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  type MatrixClient,
  type Room,
} from 'matrix-js-sdk';
import { sendAttachment, uploadClientFor, type OutgoingFile, type UploadClient } from '../media/upload';
import { stickerContent, type Sticker } from '../stickers/imagePack';
import { geoUri, type Place } from './location';
import type * as Markdown from './composerMarkdown';
import { currentMarker, rememberMovedMarker } from './readMarker';
import { reuse } from './reuse';
import { canSendPoll, pollEndContent, pollStartContent, type PollDraft } from './poll';
import { mentionsMarkdown, rankCandidates, unlinkMentions, type ComposerMention, type RankedCandidate } from './composerMentions';
import { failureOf, mapEvent, threadRootOf, type MapperContext } from './mapper';
import { previewOf } from '../rooms/preview';
import { trustUnsignedDevices, withdrawChangedVerifications } from '../encryption/sendAnyway';
import { isMarkedUnread, MARKED_UNREAD } from '../rooms/summarize';
import { layout, SHOW_ALL_SERVICE, type ServiceHiding, type TimelineItem } from './layout';
import type { Message, Reaction, ThreadSummary } from './message';

/**
 * Вложение в пути: загружается или не загрузилось. В ленте стоит своим пузырём с
 * прогрессом, пока событие не отправлено; дальше его место занимает обычное эхо SDK.
 */
export interface Upload {
  id: string;
  file: OutgoingFile;
  caption?: string;
  replyTo?: { eventId: string; senderId: string; own: boolean };
  /** Связь события целиком — у ответа в треде: `m.thread` и подпорка `m.in_reply_to`. */
  relatesTo?: Record<string, unknown>;
  /** 0…1 */
  progress: number;
  state: 'uploading' | 'failed';
}

/** Что не получилось — ключи текстов нативной Искры (`timeline.*Failed`; `sendAnywayFailed` — из `message.delivery.*`). */
export type TimelineFailure = 'reactionFailed' | 'deleteFailed' | 'editFailed' | 'pinFailed' | 'pollFailed' | 'reportFailed' | 'sendAnywayFailed' | 'stickerFailed';

/** Кто поставил реакцию и какую — `Reactor` нативной. */
export interface Reactor {
  userId: string;
  name: string;
  avatarUrl?: string;
  key: string;
}

const PINNED_EVENTS = 'm.room.pinned_events';
/** Как долго «печатает» держится без нового нажатия — и как часто его повторять. */
const TYPING_TIMEOUT_MS = 30_000;
const TYPING_REPEAT_MS = 20_000;
/** Сколько страниц истории листать в поисках закреплённого, прежде чем сдаться. */
const JUMP_MAX_PAGES = 10;

const PAGE_SIZE = 30;
/** Тред просится у сервера страницами по стольку, пока не кончится. */
const THREAD_PAGE_SIZE = 50;
const THREAD_MAX_PAGES = 20;

/** Как лента комнаты обходится с тредами — решают настройки и сама комната, наверху. */
export interface ThreadMode {
  /** Строка «N ответов» под сообщением и «Ответить в треде». */
  enabled: boolean;
  /** Ответы в тредах — только в треде, не в общей ленте. */
  hidesReplies: boolean;
}
/** Сколько страниц за один `fill`. Больше — это уже не «наполнить экран». */
const MAX_PAGES = 20;
const PAGE_TIMEOUT_MS = 20_000;

type PageOutcome = 'fetched' | 'waited' | 'failed' | 'start';

export class TimelineStore {
  items = $state.raw<TimelineItem[]>([]);
  /** Какие служебные строки спрятать — решают настройки устройства, наверху. */
  private hiding: ServiceHiding = SHOW_ALL_SERVICE;
  private unreadFrom: string | undefined;
  messages = $state.raw<Message[]>([]);
  /** Дошли до начала комнаты — больше просить нечего. */
  atStart = $state(false);
  /** Идёт страница, которую попросил сам человек прокруткой, — для спиннера наверху. */
  loadingMore = $state(false);
  /** Первая страница не пришла вовсе — «Не удалось открыть чат», а не пустой чат. */
  loadFailed = $state(false);
  /** Кто сейчас печатает — имена, без меня. */
  typing = $state.raw<string[]>([]);
  /** Закреплённые — по порядку закрепления, последнее — в конце. */
  pinnedIds = $state.raw<string[]>([]);
  /** Последнее закреплённое — для полосы над лентой. Не загружено — достаём отдельно. */
  pinnedMessage = $state.raw<Message | undefined>(undefined);
  canPin = $state(false);
  /** Можно ли писать сюда — по правам комнаты. Нельзя — вместо поля плашка, как в нативной. */
  canPost = $state(true);
  /** Вложения в пути — по порядку отправки. */
  uploads = $state.raw<Upload[]>([]);
  /** Последнее действие не удалось — сказать и дать повторить. */
  failure = $state<TimelineFailure | null>(null);

  readonly roomId: string;
  /** Это лента треда — ID его корня; в ленте — корень и ответы, и только они. */
  readonly threadRootId: string | undefined;
  private threads: ThreadMode = { enabled: false, hidesReplies: false };
  /** Ответы треда, которые дал сервер (`/relations`): старые в общей ленте могут быть не загружены. */
  private threadFetched: MatrixEvent[] = [];
  private threadRoot: MatrixEvent | undefined;
  private threadLoaded = false;
  /** Последний ответ из сводки сервера — событием, один раз на ID. */
  // Кэш, а не состояние.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly threadLatest = new Map<string, MatrixEvent>();
  private readonly client: MatrixClient;
  private readonly ownUserId: string;
  private generation = 0;
  private pageInFlight: Promise<PageOutcome> | null = null;
  private scheduled = false;
  private destroyed = false;
  private readonly detach: Array<() => void> = [];
  /** Ключ строки держится за объект события: local echo получает настоящий ID, строка — нет. */
  private readonly keys = new WeakMap<MatrixEvent, string>();
  private nextKey = 0;
  /** Закреплённые, которых нет в загруженной ленте, — достаются по одному и помнятся. */
  // Кэш, а не состояние: экран видит его через `pinnedMessage`.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly fetched = new Map<string, Message | null>();
  private typingSentAt = 0;
  private readonly uploader: UploadClient;
  // Служебное, не состояние: экран видит `uploads`.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly aborts = new Map<string, AbortController>();
  /** Вложения уходят по одному: порядок в ленте — порядок, в котором их выбрали. */
  private uploadQueue: Promise<void> = Promise.resolve();
  private nextUpload = 0;

  constructor(client: MatrixClient, roomId: string, uploader?: UploadClient, threadRootId?: string) {
    this.client = client;
    this.roomId = roomId;
    this.threadRootId = threadRootId;
    this.uploader = uploader ?? uploadClientFor(client);
    this.ownUserId = client.getSafeUserId();
    this.listen();
    this.rebuild();
  }

  /**
   * Где человек остановился в прошлый раз — `m.fully_read`, прочитанный один раз за визит. Как
   * в Telegram: полоса стоит весь визит и уходит в следующий. Сдвинь её сразу, как дочитали, —
   * SDK убрал бы её из-под глаз, и лента прыгнула бы на её высоту.
   */
  private unreadMarker: string | null | undefined;
  /** Последнее, до чего дочитали за этот визит: при уходе маркер встанет сюда. */
  private readToEnd: string | undefined;

  private markerOf(room: Room): string | null {
    if (this.unreadMarker === undefined) {
      const marker = room.getAccountData('m.fully_read')?.getContent()['event_id'];
      this.unreadMarker = currentMarker(this.roomId, typeof marker === 'string' ? marker : null);
    }
    return this.unreadMarker;
  }

  private get room(): Room | null {
    return this.client.getRoom(this.roomId);
  }

  private listen(): void {
    const on = (event: string, handler: (...args: never[]) => void) => {
      const target = this.client as unknown as {
        on(e: string, h: (...args: never[]) => void): void;
        off(e: string, h: (...args: never[]) => void): void;
      };
      target.on(event, handler);
      this.detach.push(() => target.off(event, handler));
    };
    const mine = (room: Room | undefined | null) => room?.roomId === this.roomId;
    on(RoomEvent.Timeline, (_e: MatrixEvent, room: Room | undefined) => mine(room) && this.schedule());
    on(RoomEvent.LocalEchoUpdated, (_e: MatrixEvent, room: Room) => mine(room) && this.schedule());
    on(RoomEvent.Redaction, (_e: MatrixEvent, room: Room) => mine(room) && this.schedule());
    on(RoomEvent.Receipt, (_e: MatrixEvent, room: Room) => mine(room) && this.schedule());
    on(RoomEvent.TimelineReset, (room: Room | undefined) => {
      if (!mine(room)) return;
      // Сервер прислал «слишком много пропущено» — живая лента начата заново. Старые
      // страницы к ней не относятся; всё, что летит, — в прошлое поколение.
      this.generation++;
      this.pageInFlight = null;
      this.atStart = false;
      this.schedule();
    });
    on(MatrixEventEvent.Decrypted, (event: MatrixEvent) => event.getRoomId() === this.roomId && this.schedule());
    on(MatrixEventEvent.Replaced, (event: MatrixEvent) => event.getRoomId() === this.roomId && this.schedule());
    on(RoomMemberEvent.Name, (_e: MatrixEvent, member: { roomId: string }) => member.roomId === this.roomId && this.schedule());
    on(RoomMemberEvent.Typing, (_e: MatrixEvent, member: { roomId: string }) => member.roomId === this.roomId && this.readTyping());
    on(RoomStateEvent.Events, (event: MatrixEvent) => event.getRoomId() === this.roomId && this.schedule());
    on(ClientEvent.AccountData, (event: MatrixEvent) => event.getType() === EventType.IgnoredUserList && this.schedule());
  }

  private readTyping(): void {
    const room = this.room;
    this.typing = room
      ? room
          .getMembers()
          .filter((m) => m.typing && m.userId !== this.ownUserId)
          .map((m) => m.rawDisplayName?.trim() || m.userId)
      : [];
  }

  private schedule(): void {
    if (this.scheduled || this.destroyed) return;
    this.scheduled = true;
    const run = () => {
      this.scheduled = false;
      if (!this.destroyed) this.rebuild();
    };
    if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  /** Спрятать или вернуть служебные строки — без новой сборки из SDK, только раскладка. */
  setServiceHiding(hiding: ServiceHiding): void {
    if (hiding.nameChanges === this.hiding.nameChanges && hiding.membership === this.hiding.membership) return;
    this.hiding = { ...hiding };
    this.items = reuse(this.items, layout(this.messages, this.unreadFrom, this.hiding));
  }

  /** Треды в этой комнате — по настройкам и её размеру (см. `ThreadSettings` нативной). */
  setThreads(mode: ThreadMode): void {
    if (mode.enabled === this.threads.enabled && mode.hidesReplies === this.threads.hidesReplies) return;
    this.threads = { ...mode };
    this.schedule();
  }

  /** Пересобирает ленту сейчас. Тестам — чтобы не ждать кадра. */
  rebuild(): void {
    const room = this.room;
    if (!room) {
      this.messages = [];
      this.items = [];
      return;
    }
    this.readPinned(room);
    const live = room.getLiveTimeline().getEvents();
    const pending = pendingOf(room);
    const context = this.context(room, live, pending);
    const messages: Message[] = [];
    // Первое сообщение после маркера прочитанного — над ним полоса. Маркер не среди
    // загруженного — полосы нет. В треде полосы нет вовсе: маркер — комнаты.
    const marker = this.threadRootId ? null : this.markerOf(room);
    let passedMarker = false;
    let unreadFrom: string | undefined;
    for (const event of this.threadRootId ? this.threadEvents(room, live) : this.roomEvents(live)) {
      const message = mapEvent(event, context);
      if (message) {
        messages.push(message);
        if (passedMarker && !unreadFrom) unreadFrom = message.key;
      }
      if (marker && event.getId() === marker) passedMarker = true;
    }
    // Не ушедшие — SDK держит их отдельно от ленты (`pendingEventOrdering: detached`, так
    // создаёт клиент `UserSession`), и они стоят в конце, пока не уйдут или их не уберут.
    for (const event of pending) {
      if (!this.belongs(event)) continue;
      if (messages.some((m) => m.key === this.keys.get(event))) continue;
      const message = mapEvent(event, context);
      if (message) messages.push(message);
    }
    markRead(room, this.ownUserId, messages);
    // Не изменившееся — прежними объектами: экран перерисует только то, что правда другое.
    this.messages = reuse(this.messages, messages);
    this.unreadFrom = unreadFrom;
    this.items = reuse(this.items, layout(this.messages, unreadFrom, this.hiding));
    this.readPinnedMessage(room, context);
    if (!this.threadRootId && this.atStart === false && room.getLiveTimeline().getPaginationToken(Direction.Backward) === null) {
      this.atStart = true;
    }
  }

  /** Общая лента: ответы в тредах — тоже, пока их не велели оставить только в треде. */
  private roomEvents(live: MatrixEvent[]): MatrixEvent[] {
    return this.threads.enabled && this.threads.hidesReplies ? live.filter((e) => !threadRootOf(e)) : live;
  }

  /** Лента треда: корень, потом ответы по времени — и полученные от сервера, и пришедшие синхронизацией. */
  private threadEvents(room: Room, live: MatrixEvent[]): MatrixEvent[] {
    const rootId = this.threadRootId!;
    const byId: Record<string, MatrixEvent> = {};
    for (const event of this.threadFetched) byId[event.getId() ?? ''] = event;
    for (const event of live) if (threadRootOf(event) === rootId) byId[event.getId() ?? ''] = event;
    const replies = Object.values(byId).sort((a, b) => a.getTs() - b.getTs());
    const root = room.findEventById(rootId) ?? this.threadRoot;
    return root ? [root, ...replies] : replies;
  }

  /** Не ушедшее — в эту ли ленту: в треде — только его ответы; в общей — по тем же правилам, что ушедшее. */
  private belongs(event: MatrixEvent): boolean {
    const root = threadRootOf(event);
    if (this.threadRootId) return root === this.threadRootId;
    return !(root && this.threads.enabled && this.threads.hidesReplies);
  }

  /**
   * «N ответов» под сообщением: загруженные ответы и сводка сервера (`unsigned.m.relations`),
   * что больше. Старый тред, ответы которого в ленту не попали, сервер всё равно посчитает.
   */
  private threadSummaries(room: Room, live: MatrixEvent[], pending: MatrixEvent[]): (eventId: string) => ThreadSummary | undefined {
    const groups: Record<string, MatrixEvent[]> = {};
    for (const event of [...live, ...pending]) {
      const root = threadRootOf(event);
      if (root && !event.isRedacted() && event.status !== EventStatus.CANCELLED) (groups[root] ??= []).push(event);
    }
    const nameOf = (userId: string) => room.getMember(userId)?.rawDisplayName?.trim() || userId;
    return (eventId) => {
      const loaded = groups[eventId] ?? [];
      const server = room.findEventById(eventId)?.getUnsigned()['m.relations']?.['m.thread'] as
        | { count?: unknown; latest_event?: { event_id?: unknown; origin_server_ts?: unknown } }
        | undefined;
      const replies = Math.max(loaded.length, typeof server?.count === 'number' ? server.count : 0);
      if (!replies) return undefined;
      let latest = loaded.at(-1);
      const raw = server?.latest_event;
      if (raw && typeof raw.event_id === 'string' && (!latest || (typeof raw.origin_server_ts === 'number' ? raw.origin_server_ts : 0) > latest.getTs())) {
        latest = room.findEventById(raw.event_id) ?? this.latestFromServer(raw as never);
      }
      const sender = latest?.getSender();
      const preview = latest ? previewOf(latest) : undefined;
      return { replies, ...(sender ? { latestSender: nameOf(sender) } : {}), ...(preview ? { latest: preview } : {}) };
    };
  }

  private latestFromServer(raw: { event_id: string }): MatrixEvent {
    let event = this.threadLatest.get(raw.event_id);
    if (!event) {
      event = new MatrixEvent({ ...(raw as object), room_id: this.roomId });
      this.threadLatest.set(raw.event_id, event);
      if (event.isEncrypted()) void this.client.decryptEventIfNeeded(event).then(() => this.schedule());
    }
    return event;
  }

  private readPinned(room: Room): void {
    const state = room.getLiveTimeline().getState(Direction.Forward);
    const pinned = state?.getStateEvents(PINNED_EVENTS, '')?.getContent()['pinned'];
    const ids = Array.isArray(pinned) ? pinned.filter((id): id is string => typeof id === 'string') : [];
    if (ids.join() !== this.pinnedIds.join()) this.pinnedIds = ids;
    this.canPin = !!state?.maySendStateEvent(PINNED_EVENTS, this.ownUserId);
    this.canPost = state ? state.maySendMessage(this.ownUserId) : true;
  }

  private readPinnedMessage(room: Room, context: MapperContext): void {
    const last = this.pinnedIds.at(-1);
    if (!last) {
      this.pinnedMessage = undefined;
      return;
    }
    const loaded = this.messages.find((m) => m.eventId === last);
    if (loaded) {
      this.pinnedMessage = loaded;
      return;
    }
    const known = this.fetched.get(last);
    if (known !== undefined) {
      this.pinnedMessage = known ?? undefined;
      return;
    }
    // Закрепляют то, что важно, а важное закрепляют рано: закреплённого часто нет среди
    // загруженного. Достаём одно событие, а не листаем историю.
    this.fetched.set(last, null);
    void this.fetchEvent(room, last).then((event) => {
      const message = event ? mapEvent(event, context) : undefined;
      this.fetched.set(last, message ?? null);
      if (message) this.schedule();
    });
  }

  private async fetchEvent(room: Room, eventId: string): Promise<MatrixEvent | undefined> {
    try {
      const raw = await this.client.fetchRoomEvent(room.roomId, eventId);
      const event = new MatrixEvent(raw);
      await this.client.decryptEventIfNeeded(event);
      return event;
    } catch {
      return undefined;
    }
  }

  private context(room: Room, live: MatrixEvent[] = [], pending: MatrixEvent[] = []): MapperContext {
    const state = room.getLiveTimeline().getState(Direction.Forward);
    // Снимок на одну пересборку, не состояние.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const pinned = new Set(this.pinnedIds);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const blocked = new Set(this.client.getIgnoredUsers());
    return {
      ownUserId: this.ownUserId,
      nameOf: (userId) => room.getMember(userId)?.rawDisplayName?.trim() || userId,
      avatarOf: (userId) => room.getMember(userId)?.getMxcAvatarUrl() ?? undefined,
      eventById: (eventId) => room.findEventById(eventId),
      reactionsOf: (eventId) => this.reactionsOf(room, eventId),
      relationsOf: (eventId, relType, eventTypes) =>
        eventTypes.flatMap((type) => room.relations.getChildEventsForEvent(eventId, relType, type)?.getRelations() ?? []),
      isPinned: (eventId) => pinned.has(eventId),
      canRedactOthers: (event) => !!state?.maySendRedactionForEvent(event, this.ownUserId),
      isBlocked: (userId) => blocked.has(userId),
      ...(this.threads.enabled && !this.threadRootId ? { threadOf: this.threadSummaries(room, live, pending) } : {}),
      threaded: this.threads.enabled || !!this.threadRootId,
      keyOf: (event) => {
        let key = this.keys.get(event);
        if (!key) {
          key = event.getTxnId() ? `txn-${event.getTxnId()}` : (event.getId() ?? `local-${this.nextKey++}`);
          this.keys.set(event, key);
        }
        return key;
      },
    };
  }

  private reactionsOf(room: Room, eventId: string): Reaction[] {
    const relations = room.relations.getChildEventsForEvent(eventId, RelationType.Annotation, EventType.Reaction);
    const sorted = relations?.getSortedAnnotationsByKey() ?? [];
    return sorted
      .map(([key, events]) => {
        const live = [...events].filter((e) => !e.isRedacted() && e.status !== EventStatus.CANCELLED);
        return { key, count: live.length, mine: live.some((e) => e.getSender() === this.ownUserId) };
      })
      .filter((r) => r.count > 0);
  }

  /**
   * Наполнить экран: страница за страницей, пока `needsMore()` говорит «мало». Открытие
   * чата и «окно стало выше» (развернули на весь экран) — один и тот же вызов.
   */
  async fill(needsMore: () => boolean): Promise<void> {
    if (this.threadRootId) return this.loadThread();
    let fetched = 0;
    let waited = 0;
    while (!this.destroyed && !this.atStart && needsMore() && fetched < MAX_PAGES && waited < MAX_PAGES) {
      const outcome = await this.page(false);
      if (outcome === 'fetched') fetched++;
      else if (outcome === 'waited') waited++;
      else if (outcome === 'start') break;
      else {
        // Страница не пришла. Пустой чат после этого — не «пусто», а «не открылся».
        if (this.messages.length === 0) this.loadFailed = true;
        break;
      }
      // Дать экрану разложить новое, прежде чем спрашивать «мало ли ещё».
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /** Следующая страница — прокрутка дошла до верха. */
  async loadMore(): Promise<void> {
    if (this.threadRootId) return this.loadThread();
    await this.page(true);
  }

  /**
   * Тред целиком — у сервера (`/relations/…/m.thread`), страница за страницей: ответов в треде
   * немного, а в общей ленте старых может не быть вовсе. Один раз за жизнь ленты; новое приходит
   * синхронизацией.
   */
  private threadLoading: Promise<void> | null = null;
  private loadThread(): Promise<void> {
    if (this.threadLoaded) return Promise.resolve();
    this.threadLoading ??= (async () => {
      const rootId = this.threadRootId!;
      const events: MatrixEvent[] = [];
      let from: string | undefined;
      try {
        for (let page = 0; page < THREAD_MAX_PAGES; page++) {
          const result = await withTimeout(
            this.client.relations(this.roomId, rootId, 'm.thread', null, { dir: Direction.Backward, limit: THREAD_PAGE_SIZE, ...(from ? { from } : {}) }),
            PAGE_TIMEOUT_MS,
          );
          if (result.originalEvent) this.threadRoot ??= result.originalEvent;
          events.push(...result.events);
          if (!result.nextBatch) break;
          from = result.nextBatch;
        }
        await Promise.all([...events, ...(this.threadRoot ? [this.threadRoot] : [])].map((e) => this.client.decryptEventIfNeeded(e).catch(() => {})));
        this.threadFetched = events;
        this.threadLoaded = true;
        this.atStart = true;
      } catch {
        if (!this.room?.findEventById(rootId) && !this.threadRoot) this.loadFailed = true;
      } finally {
        this.threadLoading = null;
        this.rebuild();
      }
    })();
    return this.threadLoading;
  }

  /** «Попробовать снова» после неудачного открытия. */
  async retryOpen(needsMore: () => boolean): Promise<void> {
    this.loadFailed = false;
    await this.fill(needsMore);
  }

  private async page(byUser: boolean): Promise<PageOutcome> {
    if (this.pageInFlight) {
      await this.pageInFlight;
      return 'waited';
    }
    const room = this.room;
    if (!room) return 'failed';
    if (this.atStart) return 'start';

    const generation = this.generation;
    if (byUser) this.loadingMore = true;
    const task = (async (): Promise<PageOutcome> => {
      try {
        const more = await withTimeout(
          this.client.paginateEventTimeline(room.getLiveTimeline(), { backwards: true, limit: PAGE_SIZE }),
          PAGE_TIMEOUT_MS,
        );
        if (generation !== this.generation) return 'waited';
        if (!more) this.atStart = true;
        this.rebuild();
        return more ? 'fetched' : 'start';
      } catch {
        return 'failed';
      }
    })();
    this.pageInFlight = task;
    try {
      return await task;
    } finally {
      if (this.pageInFlight === task) this.pageInFlight = null;
      if (byUser) this.loadingMore = false;
    }
  }

  // ————— Отправка —————

  /**
   * Текст уходит; local echo появляется в ленте сразу, статус — в `delivery`. С `replyTo` —
   * ответ: связь `m.in_reply_to` и упоминание автора, без цитаты-подпорки в теле (её
   * отменила спецификация, а цитату рисует получатель).
   *
   * Markdown — как в мессенджерах (`composerMarkdown.ts`); `mentions` — выбранные из списка
   * «@» (`composerMentions.ts`): ссылками в тексте и в `m.mentions`.
   */
  send(text: string, replyTo?: Message, mentions: ComposerMention[] = []): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.typingStopped();
    withMarkdown((markdown) => this.sendText(textContent(markdown, trimmed, mentions), replyTo));
  }

  private sendText({ content: words, userIds }: ReturnType<typeof textContent>, replyTo: Message | undefined): void {
    const content: Record<string, unknown> = { msgtype: 'm.text', ...words };
    const relation = this.relationFor(replyTo);
    if (relation) content['m.relates_to'] = relation;
    if (replyTo?.eventId) {
      if (!replyTo.own && !userIds.includes(replyTo.senderId)) userIds.push(replyTo.senderId);
      content['m.mentions'] = {};
    }
    // Набор `m.mentions` — только у сообщения, которое кого-то зовёт: само его присутствие
    // выключает у получателя старые правила «моё имя в тексте».
    if (userIds.length) content['m.mentions'] = { user_ids: userIds };
    // Промис не ждём: неудача видна в самом сообщении («Не отправлено»), а не исключением.
    this.client.sendMessage(this.roomId, content as never).catch(() => this.schedule());
    this.schedule();
  }

  /**
   * Своё место. `body` — для клиентов, которые `m.location` не знают: там будет виден
   * `geo:`-адрес, а по нему уже можно открыть карту. MSC3488 — рядом, как шлёт Element.
   */
  sendLocation(place: Place, description: string): void {
    this.typingStopped();
    const uri = geoUri(place);
    const content = {
      msgtype: 'm.location',
      body: `${description} ${uri}`,
      geo_uri: uri,
      'org.matrix.msc3488.location': { uri, description },
      'org.matrix.msc3488.asset': { type: 'm.self' },
      'org.matrix.msc3488.ts': Date.now(),
      'org.matrix.msc1767.text': `${description} ${uri}`,
    };
    this.client.sendMessage(this.roomId, content as never).catch(() => this.schedule());
    this.schedule();
  }

  /**
   * Стикер из набора. Два пути — по комнате, как в нативной:
   * - **открытая** — `m.sticker` со ссылкой на картинку набора; любой клиент нарисует стикер;
   * - **зашифрованная** — а это почти любой настоящий разговор: картинку скачивают и отправляют
   *   зашифрованным `m.image` по имени `sticker.<ext>` (`sealed` готовит экран — он же чистит
   *   метаданные). `m.sticker` здесь отдал бы картинку серверу открытой.
   */
  async sendSticker(sticker: Sticker, replyTo: Message | undefined, sealed: () => Promise<OutgoingFile | null>): Promise<boolean> {
    this.typingStopped();
    this.failure = null;
    try {
      if (await this.uploader.isEncrypted(this.roomId)) {
        const file = await sealed();
        if (!file) throw new Error('sticker not prepared');
        this.sendFiles([file], undefined, replyTo);
        return true;
      }
      const content = stickerContent(sticker);
      const relation = this.relationFor(replyTo);
      if (relation) content['m.relates_to'] = relation;
      if (replyTo?.eventId) content['m.mentions'] = replyTo.own ? {} : { user_ids: [replyTo.senderId] };
      this.client.sendEvent(this.roomId, EventType.Sticker, content as never).catch(() => this.schedule());
      this.schedule();
      return true;
    } catch {
      this.failure = 'stickerFailed';
      return false;
    }
  }

  /**
   * Связь нового события. В треде — `m.thread` к корню и `m.in_reply_to` к последнему ответу как
   * подпорка (`is_falling_back`) для клиентов без тредов; на ответ внутри треда — настоящая цитата.
   * Вне треда — просто ответ, если отвечают.
   */
  private relationFor(replyTo?: Message): Record<string, unknown> | undefined {
    if (!this.threadRootId) return replyTo?.eventId ? { 'm.in_reply_to': { event_id: replyTo.eventId } } : undefined;
    const latest = [...this.messages].reverse().find((m) => m.eventId && m.delivery.state === 'sent')?.eventId ?? this.threadRootId;
    return {
      rel_type: 'm.thread',
      event_id: this.threadRootId,
      is_falling_back: !replyTo?.eventId,
      'm.in_reply_to': { event_id: replyTo?.eventId ?? latest },
    };
  }

  // ————— Вложения —————

  /**
   * Файлы уходят по одному, подпись — с первым, ответ — тоже с первым. Путь наверх один —
   * `sendAttachment`, и он сам решает, шифровать ли (см. `core/media/upload.ts`).
   */
  sendFiles(files: OutgoingFile[], caption?: string, replyTo?: Message): void {
    this.typingStopped();
    const reply = replyTo?.eventId ? { eventId: replyTo.eventId, senderId: replyTo.senderId, own: replyTo.own } : undefined;
    files.forEach((file, index) => {
      const upload: Upload = {
        id: `upload-${this.nextUpload++}`,
        file,
        progress: 0,
        state: 'uploading',
        ...(index === 0 && caption?.trim() ? { caption: caption.trim() } : {}),
        ...(index === 0 && reply ? { replyTo: reply } : {}),
        ...(this.threadRootId ? { relatesTo: this.relationFor(index === 0 ? replyTo : undefined)! } : {}),
      };
      this.uploads = [...this.uploads, upload];
      this.enqueue(upload.id);
    });
  }

  retryUpload(id: string): void {
    this.patchUpload(id, { state: 'uploading', progress: 0 });
    this.enqueue(id);
  }

  /** Отменить: идущая загрузка обрывается, не ушедшее — просто убирается. */
  cancelUpload(id: string): void {
    this.aborts.get(id)?.abort();
    this.aborts.delete(id);
    this.uploads = this.uploads.filter((u) => u.id !== id);
  }

  private enqueue(id: string): void {
    this.uploadQueue = this.uploadQueue.then(() => this.runUpload(id));
  }

  private async runUpload(id: string): Promise<void> {
    const upload = this.uploads.find((u) => u.id === id);
    // Ушли из чата — загрузка всё равно доезжает: текст при уходе тоже уходит.
    if (!upload) return;
    const abort = new AbortController();
    this.aborts.set(id, abort);
    try {
      await sendAttachment(this.uploader, this.roomId, upload.file, {
        ...(upload.caption ? { caption: upload.caption } : {}),
        ...(upload.replyTo ? { replyTo: upload.replyTo } : {}),
        ...(upload.relatesTo ? { relatesTo: upload.relatesTo } : {}),
        signal: abort.signal,
        onProgress: (progress) => this.patchUpload(id, { progress }),
      });
      // Ушло — дальше это обычное событие ленты (эхо SDK), а не строка загрузки.
      this.uploads = this.uploads.filter((u) => u.id !== id);
    } catch {
      if (!abort.signal.aborted) this.patchUpload(id, { state: 'failed' });
    } finally {
      this.aborts.delete(id);
      this.schedule();
    }
  }

  private patchUpload(id: string, patch: Partial<Upload>): void {
    this.uploads = this.uploads.map((u) => (u.id === id ? { ...u, ...patch } : u));
  }

  /**
   * Правка своего: новое тело в `m.new_content`, старое — со звёздочкой для старых клиентов.
   * Зовёт правка только тех, кого в исходном сообщении ещё не звали: остальные его уже видели.
   */
  edit(message: Message, text: string, mentions: ComposerMention[] = []): void {
    const trimmed = text.trim();
    if (!trimmed || !message.canEdit || !message.eventId) return;
    const kind = message.kind;
    if (kind.type !== 'text' && kind.type !== 'emote' && kind.type !== 'notice') return;
    this.typingStopped();
    withMarkdown((markdown) => this.sendEdit(message, kind, textContent(markdown, trimmed, mentions)));
  }

  private sendEdit(message: Message, kind: { type: 'text' | 'emote' | 'notice'; body: string }, { content: words, userIds }: ReturnType<typeof textContent>): void {
    if (words.body === kind.body) return;
    const msgtype = kind.type === 'emote' ? 'm.emote' : kind.type === 'notice' ? 'm.notice' : 'm.text';
    const before = unlinkMentions(kind.body).mentions.map((m) => m.userId);
    const fresh = userIds.filter((id) => !before.includes(id));
    const content = {
      msgtype,
      body: `* ${words.body}`,
      ...(words.formatted_body ? { format: words.format, formatted_body: `* ${words.formatted_body}` } : {}),
      'm.new_content': { msgtype, ...words, ...(userIds.length ? { 'm.mentions': { user_ids: userIds } } : {}) },
      ...(fresh.length ? { 'm.mentions': { user_ids: fresh } } : {}),
      'm.relates_to': { rel_type: 'm.replace', event_id: message.eventId! },
    };
    this.act('editFailed', () => this.client.sendMessage(this.roomId, content as never));
  }

  /**
   * Кого можно позвать через «@»: все вошедшие, кроме себя; кто писал последним — выше (тот,
   * кому отвечают, почти всегда наверху), дальше — в порядке комнаты.
   */
  mentionCandidates(): RankedCandidate[] {
    const room = this.room;
    if (!room) return [];
    const people = room
      .getJoinedMembers()
      .filter((m) => m.userId !== this.ownUserId)
      .map((m) => ({
        id: m.userId,
        name: m.name || m.userId,
        ...(m.getMxcAvatarUrl() ? { avatarUrl: m.getMxcAvatarUrl()! } : {}),
        disambiguate: m.disambiguate,
      }));
    return rankCandidates(
      people,
      this.messages.map((m) => m.senderId),
    );
  }

  /** Реакция: своя такая уже стоит — снять, нет — поставить. */
  react(message: Message, key: string): void {
    const room = this.room;
    if (!room || !message.eventId) return;
    const mine = room.relations
      .getChildEventsForEvent(message.eventId, RelationType.Annotation, EventType.Reaction)
      ?.getRelations()
      .find((e) => e.getSender() === this.ownUserId && e.getRelation()?.key === key && !e.isRedacted() && e.status !== EventStatus.CANCELLED);
    if (mine) {
      const id = mine.getId();
      if (mine.status && mine.status !== EventStatus.SENT) {
        // Ещё не ушла — её и отменяем, удалять на сервере нечего.
        this.client.cancelPendingEvent(mine);
        this.schedule();
      } else if (id) {
        this.act('reactionFailed', () => this.client.redactEvent(this.roomId, id));
      }
      return;
    }
    const content = { 'm.relates_to': { rel_type: RelationType.Annotation, event_id: message.eventId, key } };
    this.act('reactionFailed', () => this.client.sendEvent(this.roomId, EventType.Reaction, content as never));
  }

  /** Удалить — у всех. Спрашивает экран; здесь — уже решено. */
  remove(message: Message): void {
    if (!message.canDelete || !message.eventId) return;
    const id = message.eventId;
    this.act('deleteFailed', () => this.client.redactEvent(this.roomId, id));
  }

  /**
   * Кто что поставил — по порядку, в каком ставили, без снятых. Для «N реакций» в меню
   * сообщения в группе: на этот вопрос пилюля с числом не отвечает.
   */
  reactors(message: Message): Reactor[] {
    const room = this.room;
    if (!room || !message.eventId) return [];
    const relations = room.relations.getChildEventsForEvent(message.eventId, RelationType.Annotation, EventType.Reaction);
    const events = [...(relations?.getRelations() ?? [])]
      .filter((e) => !e.isRedacted() && e.status !== EventStatus.CANCELLED)
      .sort((a, b) => a.getTs() - b.getTs());
    return events.flatMap((e) => {
      const userId = e.getSender();
      const key = e.getRelation()?.key;
      if (!userId || !key) return [];
      const member = room.getMember(userId);
      const avatarUrl = member?.getMxcAvatarUrl();
      return [{ userId, name: member?.name ?? userId, ...(avatarUrl ? { avatarUrl } : {}), key }];
    });
  }

  /**
   * Пожаловаться модераторам сервера — не нам: приложение жалобу не разбирает. Причина
   * необязательна: жалоба без слов — тоже жалоба.
   */
  report(message: Message, reason: string): void {
    const id = message.eventId;
    if (!id || message.own) return;
    this.act('reportFailed', () => this.client.reportEvent(this.roomId, id, -100, reason));
  }

  pin(message: Message): void {
    this.setPinned(message.eventId, true);
  }

  unpin(message: Message): void {
    this.setPinned(message.eventId, false);
  }

  /** Открепить из списка «Закреплённые»: там не сообщения ленты, а только ID. */
  unpinEvent(eventId: string): void {
    this.setPinned(eventId, false);
  }

  private setPinned(id: string | undefined, pinned: boolean): void {
    if (!id || !this.canPin) return;
    const rest = this.pinnedIds.filter((p) => p !== id);
    const next = pinned ? [...rest, id] : rest;
    this.act('pinFailed', () => this.client.sendStateEvent(this.roomId, PINNED_EVENTS as never, { pinned: next } as never, ''));
  }

  /** Голос в опросе. Пустой выбор — отозвать голос. */
  vote(message: Message, answerIds: string[]): void {
    if (message.kind.type !== 'poll' || !message.eventId || message.kind.poll.ended) return;
    const { stable, maxSelections } = message.kind.poll;
    const selections = answerIds.slice(0, maxSelections);
    const relation = { 'm.relates_to': { rel_type: 'm.reference', event_id: message.eventId } };
    const [type, content] = stable
      ? ['m.poll.response', { ...relation, 'm.selections': selections }]
      : ['org.matrix.msc3381.poll.response', { ...relation, 'org.matrix.msc3381.poll.response': { answers: selections } }];
    this.act('pollFailed', () => this.client.sendEvent(this.roomId, type as never, content as never));
  }

  /**
   * Закрыть опрос. Только автор: конец от кого-то другого комната не признаёт (см. маппер).
   * `text` — для клиентов, которые опросов не знают.
   */
  endPoll(message: Message, text: string): void {
    if (message.kind.type !== 'poll' || !message.own || !message.eventId || message.kind.poll.ended) return;
    const { type, content } = pollEndContent(message.kind.poll, message.eventId, text);
    this.act('pollFailed', () => this.client.sendEvent(this.roomId, type as never, content as never));
  }

  /** Новый опрос. Не ушёл — видно в нём самом («Не отправлено»), как у сообщения. */
  sendPoll(draft: PollDraft): void {
    if (!canSendPoll(draft)) return;
    this.typingStopped();
    const { type, content } = pollStartContent(draft);
    this.client.sendEvent(this.roomId, type as never, content as never).catch(() => this.schedule());
    this.schedule();
  }

  private act(failure: TimelineFailure, task: () => Promise<unknown>): void {
    this.failure = null;
    task().then(
      () => this.schedule(),
      () => {
        this.failure = failure;
        this.schedule();
      },
    );
    this.schedule();
  }

  dismissFailure(): void {
    this.failure = null;
  }

  /** `↑` в пустом композере — последнее своё, которое можно править. */
  lastEditable(): Message | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i]!;
      if (message.canEdit) return message;
    }
    return undefined;
  }

  /** Человек начал набирать — Markdown понадобится; загрузить, пока он пишет. Не загрузилось — `send` справится. */
  prepareToSend(): Promise<void> {
    return loadMarkdown().then(
      () => {},
      () => {},
    );
  }

  // ————— «Печатает…» —————

  /** Человек набирает текст. Повторяем не чаще раза в 20 секунд: сервер держит 30. */
  typingActive(): void {
    const now = Date.now();
    if (now - this.typingSentAt < TYPING_REPEAT_MS) return;
    this.typingSentAt = now;
    this.client.sendTyping(this.roomId, true, TYPING_TIMEOUT_MS).catch(() => {});
  }

  /** Стёр всё, отправил, ушёл из чата — перестал печатать. */
  typingStopped(): void {
    if (!this.typingSentAt) return;
    this.typingSentAt = 0;
    this.client.sendTyping(this.roomId, false, 0).catch(() => {});
  }

  // ————— Переход к сообщению —————

  /**
   * Довести ленту до события — для полосы закреплённого. Листает назад, но не бесконечно:
   * закреплённое два года назад не стоит двадцати запросов. `false` — не нашли.
   */
  async reveal(eventId: string): Promise<boolean> {
    for (let pages = 0; pages <= JUMP_MAX_PAGES; pages++) {
      if (this.messages.some((m) => m.eventId === eventId)) return true;
      if (this.destroyed || this.atStart) return false;
      const outcome = await this.page(true);
      if (outcome === 'failed' || outcome === 'start') return this.messages.some((m) => m.eventId === eventId);
    }
    return false;
  }

  private pendingByKey(key: string): MatrixEvent | undefined {
    const room = this.room;
    if (!room) return undefined;
    return [...room.getLiveTimeline().getEvents(), ...pendingOf(room)].find((e) => this.keys.get(e) === key);
  }

  /** «Отправить заново». */
  retry(key: string): void {
    const event = this.pendingByKey(key);
    const room = this.room;
    if (!event || !room || event.status !== EventStatus.NOT_SENT) return;
    this.client.resendEvent(event, room).catch(() => this.schedule());
    this.schedule();
  }

  /**
   * «Отправить всё равно» — на не ушедшее из-за проверенного, который больше не сходится
   * (`identityChanged`, `insecureDevices`). Сначала решение о доверии (`sendAnyway.ts`),
   * потом то же, что «Отправить заново». Не вышло — строка остаётся «не отправлено», а над
   * лентой — «всё ещё не ушло», как в нативной.
   */
  sendAnyway(key: string): void {
    const event = this.pendingByKey(key);
    const room = this.room;
    if (!event || !room || event.status !== EventStatus.NOT_SENT) return;
    const reason = failureOf(event.error);
    if (reason !== 'identityChanged' && reason !== 'insecureDevices') return;
    this.act('sendAnywayFailed', async () => {
      if (reason === 'identityChanged') await withdrawChangedVerifications(this.client, room);
      else if (!(await trustUnsignedDevices(this.client, room))) throw new Error('no olm machine');
      if (event.status === EventStatus.NOT_SENT) await this.client.resendEvent(event, room);
    });
  }

  /** «Удалить» не ушедшее — оно и не уходило, удалять нечего, кроме строки. */
  discard(key: string): void {
    const event = this.pendingByKey(key);
    if (!event || event.status !== EventStatus.NOT_SENT) return;
    this.client.cancelPendingEvent(event);
    this.schedule();
  }

  // ————— Прочитано —————

  private lastReceiptFor?: string;
  private clearingFlag = false;

  /** Отметить прочитанным последнее чужое — зовёт экран, когда чат виден и внизу. */
  markRead(): void {
    const room = this.room;
    // Квитанция без треда отметила бы прочитанным и общую ленту до этого места — а её не читали.
    if (!room || this.threadRootId) return;
    // Метку «непрочитано», поставленную из меню строки, снимает прочтение, как в нативной.
    if (isMarkedUnread(room) && !this.clearingFlag) {
      this.clearingFlag = true;
      this.client
        .setRoomAccountData(this.roomId, MARKED_UNREAD as never, { unread: false } as never)
        .catch(() => {})
        .finally(() => (this.clearingFlag = false));
    }
    const events = room.getLiveTimeline().getEvents();
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]!;
      const id = event.getId();
      if (!id || id.startsWith('~') || event.status) continue;
      this.readToEnd = id;
      if (room.hasUserReadEvent(this.ownUserId, id) || this.lastReceiptFor === id) return;
      this.lastReceiptFor = id;
      this.client.sendReadReceipt(event).catch(() => {
        this.lastReceiptFor = undefined;
      });
      return;
    }
  }

  destroy(): void {
    this.typingStopped();
    // Уходят, дочитав до конца, — полоса переезжает в конец, к следующему визиту.
    if (this.readToEnd && this.readToEnd !== this.unreadMarker) {
      rememberMovedMarker(this.roomId, this.readToEnd);
      this.client.setRoomReadMarkers(this.roomId, this.readToEnd).catch(() => {});
    }
    this.destroyed = true;
    this.generation++;
    for (const off of this.detach.splice(0)) off();
  }
}

function pendingOf(room: Room): MatrixEvent[] {
  try {
    return room.getPendingEvents();
  } catch {
    // `chronological`: не ушедшие уже лежат в ленте.
    return [];
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
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Что из своего прочитано — по квитанциям собеседников. Квитанция говорит «прочитал досюда»,
 * значит, прочитано и всё своё выше. Поэтому — снизу вверх до первого прочитанного: оно
 * получает «глаз», всё своё выше — просто прочитано. Меняет сообщения на месте: они только
 * что собраны этой пересборкой.
 */
function markRead(room: Room, ownUserId: string, messages: Message[]): void {
  const others = room.getJoinedMembers().filter((m) => m.userId !== ownUserId);
  if (!others.length) return;
  let read = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (!message.own || !message.eventId || message.delivery.state !== 'sent') continue;
    if (!read) {
      read = others.some((m) => room.hasUserReadEvent(m.userId, message.eventId!));
      if (read) message.readMark = true;
    }
    if (read) message.read = true;
  }
}

/**
 * Разбор Markdown (commonmark с таблицами сущностей HTML — пятая часть стартовой сборки) нужен
 * только тому, кто пишет: грузится с первым набранным символом (`prepareToSend`).
 */
let markdownModule: typeof Markdown | undefined;
let markdownLoading: Promise<typeof Markdown> | undefined;

function loadMarkdown(): Promise<typeof Markdown> {
  markdownLoading ??= import('./composerMarkdown').then(
    (module) => (markdownModule = module),
    (error: unknown) => {
      markdownLoading = undefined;
      throw error;
    },
  );
  return markdownLoading;
}

/**
 * Отправка, когда разбор уже на месте, — сразу; иначе ждёт его. Все ждут одно обещание,
 * поэтому порядок сообщений сохраняется. Не загрузился (сеть пропала посреди обновления) —
 * текст уходит как набран, без разметки: потерять сообщение хуже.
 */
function withMarkdown(then: (markdown: typeof Markdown | undefined) => void): void {
  if (markdownModule) return then(markdownModule);
  loadMarkdown().then(then, () => then(undefined));
}

/** Текст и упоминания — в содержимое события: Markdown с ссылками `matrix.to` и кого звать. */
function textContent(markdown: typeof Markdown | undefined, text: string, mentions: ComposerMention[]) {
  const linked = mentionsMarkdown(text, mentions);
  return { content: markdown ? markdown.markdownContent(linked.markdown) : { body: text }, userIds: linked.userIds };
}
