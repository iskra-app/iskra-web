import { describe, expect, it } from 'vitest';
import { contains, decodeFolders, encodeFolders, isMeaningful, moved, newFolder, roomsOf, suggestion } from '../../src/core/rooms/folders';
import type { RoomSummary } from '../../src/core/rooms/types';

function room(id: string, fields: Partial<RoomSummary> = {}): RoomSummary {
  return {
    id, avatarSeed: id, faces: [], kind: 'group', encrypted: true, membership: 'join',
    unreadCount: 0, mentionCount: 0, hasUnreadMessages: false, unreadReactions: 0, isMarkedUnread: false,
    isMuted: false, isFavourite: false, isLowPriority: false, typing: false, memberCount: 2, lastActivity: 0, ...fields,
  };
}

describe('папка — фильтр по правилам, как ChatFolder нативной', () => {
  const anya = room('!anya', { kind: 'direct', hasUnreadMessages: true });
  const weekend = room('!weekend');
  const quiet = room('!quiet', { isMuted: true, unreadCount: 2 });
  const old = room('!old', { isLowPriority: true, kind: 'direct' });
  const invite = room('!invite', { membership: 'invite' });

  it('виды: личные — только личные; приглашение — свой вид', () => {
    const personal = suggestion('personal', 'Личные');
    expect([anya, weekend, invite].filter((r) => contains(personal, r)).map((r) => r.id)).toEqual(['!anya']);
    expect(contains(newFolder('П', { kinds: ['invitations'] }), invite)).toBe(true);
  });

  it('условия: непрочитанные (приглашение — всегда), без беззвучных, архив — только если просили', () => {
    const unread = suggestion('unread', 'Непрочитанные');
    expect([anya, weekend, quiet].filter((r) => contains(unread, r)).map((r) => r.id)).toEqual(['!anya', '!quiet']);
    expect(contains({ ...unread, excludesMuted: true }, quiet)).toBe(false);
    expect(contains(newFolder('П', { kinds: ['direct'] }), old)).toBe(false);
    expect(contains(newFolder('П', { kinds: ['direct'], includesArchived: true }), old)).toBe(true);
  });

  it('вручную: добавленный — в папке, исключённый — вне её, даже если подходит', () => {
    const groups = newFolder('Группы', { kinds: ['groups'], included: ['!anya'], excluded: ['!weekend'] });
    expect(roomsOf(groups, [anya, weekend, quiet], []).map((r) => r.id)).toEqual(['!anya', '!quiet']);
  });

  it('без правил или без имени — не сохранить', () => {
    expect(isMeaningful(newFolder('Пусто'))).toBe(false);
    expect(isMeaningful(newFolder('  ', { kinds: ['direct'] }))).toBe(false);
    expect(isMeaningful(newFolder('Аня', { included: ['!anya'] }))).toBe(true);
  });
});

describe('документ — тот же, что пишут iOS и Android', () => {
  it('нативный JSON читается, и записанный — с теми же полями', () => {
    const native = { folders: [{ id: 'A1', name: 'Работа', kinds: ['groups'], onlyUnread: false, excludesMuted: true, includesArchived: false, included: ['!a'], excluded: [] }] };
    const folders = decodeFolders(native);
    expect(folders).toEqual(native.folders);
    expect(encodeFolders(folders)).toEqual(native);
  });

  it('непонятная папка пропускается, а не весь список; незнакомый вид — просто ничего не берёт', () => {
    const folders = decodeFolders({
      folders: [
        { id: 'bad', name: 'Без полей' },
        { id: 'ok', name: 'Новое', kinds: ['groups', 'channels'], onlyUnread: false, excludesMuted: false, includesArchived: false, included: [], excluded: [] },
      ],
    });
    expect(folders.map((f) => [f.id, f.kinds])).toEqual([['ok', ['groups']]]);
    expect(decodeFolders(undefined)).toEqual([]);
  });

  it('порядок: на место левее и правее, за край — никуда', () => {
    const [a, b, c] = ['a', 'b', 'c'].map((id) => ({ ...newFolder(id), id }));
    expect(moved([a!, b!, c!], 'c', -1).map((f) => f.id)).toEqual(['a', 'c', 'b']);
    expect(moved([a!, b!, c!], 'a', -1).map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });
});
