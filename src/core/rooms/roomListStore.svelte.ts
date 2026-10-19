/**
 * Список комнат.
 *
 * `matrix-js-sdk` не шлёт диффы, как `RoomListService` нативной Искры: он отдаёт живые
 * объекты `Room` и события. Стор слушает их, помечает комнату «грязной» и раз в кадр
 * пересобирает только грязные `RoomSummary`. Без этого первая синхронизация на сотне
 * комнат — тысячи перерисовок.
 */
import {
  ClientEvent,
  EventType,
  MatrixEventEvent,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  type MatrixClient,
  type MatrixEvent,
  type Room,
  type RoomMember,
  type RoomState,
} from 'matrix-js-sdk';
import { badgeCount, organize, type Organized } from './organize';
import type { LocalNameSource } from './localNames.svelte.ts';
import { mutedRoomIds, reactionsNotify } from './pushRules';
import { isMarkedUnread, MARKED_UNREAD, spaceChildren, summarize, type SummaryContext } from './summarize';
import type { RoomSummary } from './types';

const FAVOURITE = 'm.favourite';
const LOW_PRIORITY = 'm.lowpriority';

export class RoomListStore {
  /** Все комнаты, которые показываются в списке: вошли или приглашены. */
  // `raw`: сводки неизменяемы, и у неизменившейся комнаты тот же объект — строка не перерисуется.
  rooms = $state.raw<RoomSummary[]>([]);
  readonly organized: Organized = $derived(organize(this.rooms));
  readonly badge: number = $derived(badgeCount(this.rooms));

  // Не реактивные сознательно: реактивен только `rooms`, пересобираемый раз в кадр.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly byId = new Map<string, RoomSummary>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly dirty = new Set<string>();
  private everything = true;
  private scheduled = false;
  private context: SummaryContext;
  private readonly detach: Array<() => void> = [];

  constructor(
    private readonly client: MatrixClient,
    private readonly localNames?: LocalNameSource,
  ) {
    this.context = this.buildContext();
    this.listen();
    if (localNames) {
      this.detach.push(localNames.onChange((roomId) => (roomId ? this.mark(roomId) : this.markAll())));
    }
    this.flush();
  }

  private buildContext(): SummaryContext {
    const direct = this.client.getAccountData(EventType.Direct)?.getContent<Record<string, string[]>>() ?? {};
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- контекст пересобирается целиком
    const directRooms = new Map<string, string>();
    for (const [userId, roomIds] of Object.entries(direct)) {
      for (const roomId of Array.isArray(roomIds) ? roomIds : []) directRooms.set(roomId, userId);
    }
    return {
      ownUserId: this.client.getSafeUserId(),
      directRooms,
      mutedRooms: mutedRoomIds(this.client.pushRules),
      reactionsNotify: reactionsNotify(this.client.pushRules),
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- снимок, как и весь контекст
      blocked: new Set(this.client.getIgnoredUsers()),
      ...(this.localNames ? { localName: (roomId: string) => this.localNames!.get(roomId) } : {}),
    };
  }

  /** Подписка на клиент с отпиской в `destroy`. Типы событий SDK здесь не помогают, а мешают. */
  private on(event: string, handler: (...args: never[]) => void): void {
    const target = this.client as unknown as {
      on(e: string, h: (...args: never[]) => void): void;
      off(e: string, h: (...args: never[]) => void): void;
    };
    target.on(event, handler);
    this.detach.push(() => target.off(event, handler));
  }

  private listen(): void {
    const markRoom = (room: Room | undefined) => room && this.mark(room.roomId);
    // Клиент пересылает события комнат от своего имени — одна подписка на все комнаты.
    this.on(ClientEvent.Room, markRoom);
    this.on(ClientEvent.DeleteRoom, (roomId: string) => {
      this.byId.delete(roomId);
      this.mark(roomId);
    });
    this.on(RoomEvent.Timeline, (_event: MatrixEvent, room: Room | undefined) => markRoom(room));
    this.on(RoomEvent.Name, markRoom);
    this.on(RoomEvent.Receipt, (_event: MatrixEvent, room: Room) => markRoom(room));
    this.on(RoomEvent.Tags, (_event: MatrixEvent, room: Room) => markRoom(room));
    this.on(RoomEvent.AccountData, (_event: MatrixEvent, room: Room) => markRoom(room));
    this.on(RoomEvent.MyMembership, markRoom);
    this.on(RoomEvent.UnreadNotifications, (_counts: unknown, _thread: unknown) => {
      // Событие не говорит, какая комната; счётчики меняются пачкой с синхронизацией.
      this.markAll();
    });
    this.on(RoomEvent.LocalEchoUpdated, (_event: MatrixEvent, room: Room) => markRoom(room));
    // «печатает…» на месте превью — и снова превью, когда перестали.
    this.on(RoomMemberEvent.Typing, (_event: MatrixEvent, member: RoomMember) => this.mark(member.roomId));
    this.on(RoomEvent.Redaction, (_event: MatrixEvent, room: Room) => markRoom(room));
    this.on(RoomStateEvent.Events, (_event: MatrixEvent, state: RoomState) => this.mark(state.roomId));
    this.on(MatrixEventEvent.Decrypted, (event: MatrixEvent) => {
      const roomId = event.getRoomId();
      if (roomId) this.mark(roomId);
    });
    this.on(ClientEvent.AccountData, (event: MatrixEvent) => {
      // `m.direct`, push rules и заблокированные меняют вид любой комнаты — пересобрать всё.
      if (event.getType() === EventType.Direct || event.getType() === EventType.PushRules || event.getType() === EventType.IgnoredUserList) {
        this.context = this.buildContext();
        this.markAll();
      }
    });
  }

  private mark(roomId: string): void {
    this.dirty.add(roomId);
    this.schedule();
  }

  private markAll(): void {
    this.everything = true;
    this.schedule();
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    const run = () => {
      this.scheduled = false;
      this.flush();
    };
    // Раз в кадр; в фоновой вкладке кадров нет — тогда таймер, чтобы заголовок с числом
    // непрочитанных всё равно обновлялся.
    if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 50);
    }
  }

  /** Пересобирает грязное прямо сейчас. Тестам — чтобы не ждать кадра. */
  flush(): void {
    const ids = this.everything ? this.client.getRooms().map((room) => room.roomId) : [...this.dirty];
    if (this.everything) this.byId.clear();
    this.everything = false;
    this.dirty.clear();
    let changed = false;
    for (const roomId of ids) {
      const room = this.client.getRoom(roomId);
      const summary = room ? summarize(room, this.context) : undefined;
      if (summary) this.byId.set(roomId, summary);
      else this.byId.delete(roomId);
      changed = true;
    }
    if (changed || this.rooms.length !== this.byId.size) this.rooms = [...this.byId.values()];
  }

  get(roomId: string): RoomSummary | undefined {
    // Читаем `rooms` — ради реактивности: `byId` — обычный `Map`, и без этого экран, открывший
    // комнату раньше, чем она пришла (только что созданную), не узнал бы, что она появилась.
    void this.rooms;
    return this.byId.get(roomId);
  }

  /** Комнаты пространства, которые у нас есть. */
  childrenOf(spaceId: string): RoomSummary[] {
    const space = this.client.getRoom(spaceId);
    if (!space) return [];
    return spaceChildren(space)
      .map((id) => this.byId.get(id))
      .filter((room): room is RoomSummary => !!room);
  }

  // ————— Из меню строки: `RoomListStore` нативной —————
  // Каждое — `true`, если сервер принял: что не так, скажет экран, а строка вернётся сама —
  // сводка пересобирается из того, что пришло синхронизацией, а не из того, что просили.

  /** Закрепить — тег `m.favourite`. */
  setPinned(roomId: string, pinned: boolean): Promise<boolean> {
    return this.act(() => (pinned ? this.client.setRoomTag(roomId, FAVOURITE, {}) : this.client.deleteRoomTag(roomId, FAVOURITE)));
  }

  /**
   * В архив — тег `m.lowpriority`, ближайшее, что в Matrix есть к архиву. История не трогается:
   * чат просто уходит из списка в «Архив».
   */
  setArchived(roomId: string, archived: boolean): Promise<boolean> {
    return this.act(() => (archived ? this.client.setRoomTag(roomId, LOW_PRIORITY, {}) : this.client.deleteRoomTag(roomId, LOW_PRIORITY)));
  }

  /**
   * Прочитано — отметка о прочтении на последнем и снятая метка «непрочитано». Обе половины:
   * отметка метку не снимает, и без второй значок оставался бы.
   */
  markRead(roomId: string): Promise<boolean> {
    return this.act(async () => {
      const room = this.client.getRoom(roomId);
      const last = room
        ?.getLiveTimeline()
        .getEvents()
        .findLast((event) => !!event.getId() && !event.getId()!.startsWith('~') && !event.status);
      if (last && !room!.hasUserReadEvent(this.client.getSafeUserId(), last.getId()!)) await this.client.sendReadReceipt(last);
      if (room && isMarkedUnread(room)) await this.client.setRoomAccountData(roomId, MARKED_UNREAD as never, { unread: false } as never);
    });
  }

  /** Непрочитано — метка `m.marked_unread`: значок вернётся, хотя нового нет, — как напоминание. */
  markUnread(roomId: string): Promise<boolean> {
    return this.act(() => this.client.setRoomAccountData(roomId, MARKED_UNREAD as never, { unread: true } as never));
  }

  private async act(task: () => Promise<unknown>): Promise<boolean> {
    try {
      await task();
      return true;
    } catch {
      return false;
    }
  }

  /** «Войти» по приглашению. */
  async accept(roomId: string): Promise<void> {
    await this.client.joinRoom(roomId);
  }

  /** «Отклонить» приглашение. */
  async decline(roomId: string): Promise<void> {
    await this.client.leave(roomId);
  }

  destroy(): void {
    for (const off of this.detach.splice(0)) off();
  }
}
