/**
 * Знакомые — все, с кем есть личный чат, по разу (`NewChatView.contacts` нативной): для «Нового
 * чата» и «Пригласить». Лицо личного чата растёт из Matrix ID собеседника; где ядро не знает,
 * кто это, — его нет и в списке. Два чата с одним человеком — один, более свежий.
 */
import type { RoomSummary } from '../../core/rooms/types';
import { roomName } from './text';

export interface Contact {
  id: string;
  name: string;
  avatarUrl?: string;
  roomId: string;
}

export function contactsOf(rooms: Iterable<RoomSummary>): Contact[] {
  const seen = new Set<string>();
  const result: Contact[] = [];
  for (const room of rooms) {
    if (room.kind !== 'direct' || room.membership !== 'join' || !room.avatarSeed.startsWith('@') || seen.has(room.avatarSeed)) continue;
    seen.add(room.avatarSeed);
    result.push({ id: room.avatarSeed, name: roomName(room), ...(room.avatarUrl ? { avatarUrl: room.avatarUrl } : {}), roomId: room.id });
  }
  return result;
}

export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/** По первым буквам, как читают записную книжку. Что начинается не с буквы — под «#», в конце. */
export function byLetter<T extends { name: string }>(people: readonly T[]): Array<{ letter: string; people: T[] }> {
  const groups = new Map<string, T[]>();
  for (const person of people) {
    const first = [...person.name][0] ?? '';
    const letter = /\p{L}/u.test(first) ? first.toLocaleUpperCase() : '#';
    groups.set(letter, [...(groups.get(letter) ?? []), person]);
  }
  return [...groups.entries()]
    .map(([letter, group]) => ({ letter, people: group.sort(byName) }))
    .sort((a, b) => (a.letter === '#' ? 1 : b.letter === '#' ? -1 : a.letter.localeCompare(b.letter)));
}

/** Знакомые, в чьём имени или ID есть набранное. */
export function matching<T extends { id: string; name: string }>(people: readonly T[], term: string): T[] {
  const needle = term.toLocaleLowerCase();
  return people.filter((c) => c.name.toLocaleLowerCase().includes(needle) || c.id.toLocaleLowerCase().includes(needle)).sort(byName);
}
