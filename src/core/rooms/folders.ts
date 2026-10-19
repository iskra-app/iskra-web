/**
 * Папки чатов, как в Telegram, — `ChatFolder` нативной Искры: имя и правило, какие чаты в
 * ней. Правило — несколько видов чатов (личные, группы, пространства, приглашения), сужение
 * условиями (только непрочитанные, без беззвучных, с архивом или без) и поправки по имени:
 * добавленные вручную — в папке, если пропускают условия; исключённые вручную — вне её
 * всегда. Папка — фильтр, а не копия: порядок внутри — порядок списка, и чат бывает в
 * скольких угодно папках.
 *
 * В Matrix такого нет (теги — по одному на чат и не правила), поэтому папки живут в данных
 * аккаунта под ключом приложения и едут на все устройства. Документ тот же, что пишут iOS и
 * Android: поля и их имена — как у `Codable` нативной, все обязательны.
 */
import type { RoomSummary } from './types';

export const folderKinds = ['direct', 'groups', 'spaces', 'invitations'] as const;
export type FolderKind = (typeof folderKinds)[number];

export interface ChatFolder {
  id: string;
  name: string;
  kinds: FolderKind[];
  /** Только с непрочитанным — «исключить прочитанные» Telegram. */
  onlyUnread: boolean;
  /** Без чатов, которым выключили звук. */
  excludesMuted: boolean;
  /** Архив тоже. По умолчанию нет: что убрали, то убрали. */
  includesArchived: boolean;
  /** Всегда в папке, что бы ни говорили виды, — но условия действуют. По ID комнаты. */
  included: string[];
  /** Никогда. Сильнее всего остального. */
  excluded: string[];
}

/**
 * Старый префикс нативной (`moscow.swag.iskra`) — нарочно: имя живёт на сервере и общее с
 * Android, переименовать — потерять то, что под ним лежит.
 */
export const FOLDERS_TYPE = 'moscow.swag.iskra.chat_folders';
/** Предел Telegram — и больше вкладок, чем кто-либо прочтёт в ряд. */
export const FOLDER_LIMIT = 10;

export function newFolder(name = '', fields: Partial<ChatFolder> = {}): ChatFolder {
  return {
    id: crypto.randomUUID().toUpperCase(),
    name,
    kinds: [],
    onlyUnread: false,
    excludesMuted: false,
    includesArchived: false,
    included: [],
    excluded: [],
    ...fields,
  };
}

/** В архиве — как в `organize`: приглашение и пространство туда не прячутся. */
export const isArchived = (room: RoomSummary): boolean => room.isLowPriority && room.membership !== 'invite' && room.kind !== 'space';

export function kindOf(room: RoomSummary): FolderKind {
  if (room.membership === 'invite') return 'invitations';
  if (room.kind === 'space') return 'spaces';
  if (room.kind === 'direct') return 'direct';
  return 'groups';
}

const unread = (room: RoomSummary) => room.unreadCount > 0 || room.hasUnreadMessages || room.isMarkedUnread;

export function contains(folder: ChatFolder, room: RoomSummary): boolean {
  if (folder.excluded.includes(room.id)) return false;
  if (isArchived(room) && !folder.includesArchived) return false;
  if (folder.excludesMuted && room.isMuted) return false;
  if (folder.onlyUnread && !unread(room) && room.membership !== 'invite') return false;
  return folder.included.includes(room.id) || folder.kinds.includes(kindOf(room));
}

/** Чаты папки — из списка, в его порядке; архив — следом, если папка его берёт. */
export function roomsOf(folder: ChatFolder, list: readonly RoomSummary[], archived: readonly RoomSummary[]): RoomSummary[] {
  return (folder.includesArchived ? [...list, ...archived] : list).filter((room) => contains(folder, room));
}

/** Имя и хоть одно правило: папка с именем и без правил всегда пуста, такую не сохранить. */
export const isMeaningful = (folder: ChatFolder): boolean => folder.name.trim() !== '' && (folder.kinds.length > 0 || folder.included.length > 0);

export const suggestionKinds = ['personal', 'groups', 'unread'] as const;
export type FolderSuggestion = (typeof suggestionKinds)[number];

/** С чего предложить начать — папки, которые предлагает Telegram. */
export function suggestion(kind: FolderSuggestion, name: string): ChatFolder {
  if (kind === 'personal') return newFolder(name, { kinds: ['direct'] });
  if (kind === 'groups') return newFolder(name, { kinds: ['groups'] });
  return newFolder(name, { kinds: ['direct', 'groups'], onlyUnread: true });
}

export function encodeFolders(folders: readonly ChatFolder[]): { folders: ChatFolder[] } {
  return { folders: folders.map((f) => ({ ...f, kinds: [...f.kinds], included: [...f.included], excluded: [...f.excluded] })) };
}

/**
 * Снисходительно: папка, которую эта версия не поняла, пропускается, а не весь список, —
 * другое устройство на новой версии могло дописать поле, о котором здесь не слышали.
 */
export function decodeFolders(content: unknown): ChatFolder[] {
  const raw = (content as { folders?: unknown } | null | undefined)?.folders;
  if (!Array.isArray(raw)) return [];
  const strings = (value: unknown): string[] | null => (Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : null);
  const folders: ChatFolder[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const kinds = strings(f['kinds']);
    const included = strings(f['included']);
    const excluded = strings(f['excluded']);
    if (typeof f['id'] !== 'string' || typeof f['name'] !== 'string' || !kinds || !included || !excluded) continue;
    if (typeof f['onlyUnread'] !== 'boolean' || typeof f['excludesMuted'] !== 'boolean' || typeof f['includesArchived'] !== 'boolean') continue;
    // Вид, которого эта версия не знает, — не повод терять папку: он просто ничего не берёт.
    const known = kinds.filter((k): k is FolderKind => (folderKinds as readonly string[]).includes(k));
    folders.push({ id: f['id'], name: f['name'], kinds: known, onlyUnread: f['onlyUnread'], excludesMuted: f['excludesMuted'], includesArchived: f['includesArchived'], included, excluded });
  }
  return folders;
}

/** Переставить папку на `offset` мест (−1 — левее, +1 — правее). */
export function moved(folders: readonly ChatFolder[], id: string, offset: number): ChatFolder[] {
  const from = folders.findIndex((f) => f.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= folders.length) return [...folders];
  const next = [...folders];
  const [folder] = next.splice(from, 1);
  next.splice(to, 0, folder!);
  return next;
}
