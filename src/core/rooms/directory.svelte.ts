/**
 * Каталоги сервера для «Нового чата» — как `NewChatView` и `PublicRoomsView` нативной Искры:
 * люди (`/user_directory/search`) и открытые комнаты (`/publicRooms`). И вход в комнату по
 * адресу — `#название:сервер` или ID.
 *
 * Сервер перечисляет только тех, кого сам решил показать, поэтому Matrix ID, набранный
 * целиком, — всегда кто-то, кому можно написать, есть он в каталоге или нет: это решает экран.
 */
import type { IPublicRoomsChunkRoom, MatrixClient } from 'matrix-js-sdk';
import { arrived } from './create';

/** Человек из каталога: столько, сколько нужно строке. */
export interface Person {
  id: string;
  name: string;
  avatarUrl?: string;
}

/** Комната из каталога сервера. */
export interface PublicRoom {
  id: string;
  /** Имя, иначе адрес, иначе ID — назвать её чем-то надо. */
  title: string;
  alias?: string;
  topic?: string;
  avatarUrl?: string;
  memberCount: number;
  /** Можно войти без приглашения. */
  isOpen: boolean;
}

const PEOPLE_LIMIT = 20;
const ROOMS_PAGE = 30;

/** Люди на сервере по имени или адресу — без себя. */
export async function searchPeople(client: MatrixClient, term: string): Promise<Person[]> {
  const { results } = await client.searchUserDirectory({ term: term.trim(), limit: PEOPLE_LIMIT });
  const me = client.getUserId();
  return results
    .filter((user) => user.user_id !== me)
    .map((user) => ({
      id: user.user_id,
      name: user.display_name || user.user_id,
      ...(user.avatar_url ? { avatarUrl: user.avatar_url } : {}),
    }));
}

/** Войти по адресу или ID. Возвращает ID комнаты — когда она уже пришла синхронизацией. */
export async function joinByAddress(client: MatrixClient, address: string): Promise<string> {
  const room = await client.joinRoom(address.trim());
  await arrived(client, room.roomId);
  return room.roomId;
}

function toPublicRoom(room: IPublicRoomsChunkRoom): PublicRoom {
  const alias = room.canonical_alias ?? room.aliases?.[0];
  return {
    id: room.room_id,
    title: room.name || alias || room.room_id,
    ...(alias ? { alias } : {}),
    ...(room.topic ? { topic: room.topic } : {}),
    ...(room.avatar_url ? { avatarUrl: room.avatar_url } : {}),
    memberCount: room.num_joined_members,
    // Правило входа не прислали — по спецификации это «public».
    isOpen: (room.join_rule ?? 'public') === 'public',
  };
}

/**
 * Каталог открытых комнат: весь сразу, потом — что набрали; дальше страницами, пока сервер
 * даёт `next_batch`. Ответ на прежний запрос, пришедший после нового, отбрасывается.
 */
export class PublicRoomDirectory {
  rooms = $state<PublicRoom[]>([]);
  loading = $state(false);
  failed = $state(false);

  private term = '';
  private since: string | undefined;
  private generation = 0;

  constructor(private readonly client: MatrixClient) {}

  get hasMore(): boolean {
    return this.since !== undefined;
  }

  search(term: string): Promise<void> {
    this.term = term.trim();
    this.since = undefined;
    this.rooms = [];
    return this.page(++this.generation);
  }

  loadMore(): Promise<void> {
    if (this.since === undefined || this.loading) return Promise.resolve();
    return this.page(this.generation);
  }

  private async page(generation: number): Promise<void> {
    this.loading = true;
    this.failed = false;
    try {
      const response = await this.client.publicRooms({
        limit: ROOMS_PAGE,
        ...(this.since ? { since: this.since } : {}),
        ...(this.term ? { filter: { generic_search_term: this.term } } : {}),
      });
      if (generation !== this.generation) return;
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- снимок для одной склейки страниц
      const known = new Set(this.rooms.map((room) => room.id));
      this.rooms = [...this.rooms, ...response.chunk.map(toPublicRoom).filter((room) => !known.has(room.id))];
      this.since = response.next_batch || undefined;
    } catch {
      if (generation === this.generation) this.failed = true;
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  }
}
