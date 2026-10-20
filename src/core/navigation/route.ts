/**
 * Адрес — настоящий: `/#/room/!id:server`. На десктопе работают «открыть ссылку»,
 * закладка на чат и кнопки мыши «назад/вперёд». Адрес чата не содержит ничего,
 * кроме ID комнаты, — ни текста, ни токенов: история браузера синхронизируется в облако.
 *
 * Hash, а не путь, — чтобы статическому хостингу не нужны были правила перезаписи.
 */
/** Разделы настроек — страницы, как в нативной Искре; без раздела — их список. */
export const settingsSections = ['profile', 'appearance', 'reactions', 'chats', 'folders', 'notifications', 'security', 'devices', 'blocked', 'media', 'storage', 'about', 'licences', 'beta'] as const;
export type SettingsSection = (typeof settingsSections)[number];

export type Route =
  | { name: 'home' }
  /** `thread` — открыт тред под этим сообщением (ID корня): на широком экране — панелью справа. */
  | { name: 'room'; roomId: string; thread?: string }
  | { name: 'settings'; section?: SettingsSection }
  /**
   * Чужая ссылка — `s.iskra.wtf/<id>` ведёт сюда: `#/open/<id>?via=…`. Человек, адрес
   * или ID комнаты; что с ним делать — спрашивает оболочка, когда сессия готова.
   */
  | { name: 'open'; target: string; via?: string[] };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const match = /^\/room\/([^/?#]+)(?:\/thread\/([^/?#]+))?$/.exec(path);
  if (match?.[1]) {
    try {
      const roomId = decodeURIComponent(match[1]);
      const thread = match[2] ? decodeURIComponent(match[2]) : undefined;
      if (isRoomId(roomId)) return thread && isEventId(thread) ? { name: 'room', roomId, thread } : { name: 'room', roomId };
    } catch {
      // Битая percent-кодировка — это просто неизвестный адрес.
    }
  }
  const open = /^\/open\/([^/?#]+)(?:\?([^#]*))?$/.exec(path);
  if (open?.[1]) {
    try {
      const target = decodeURIComponent(open[1]);
      if (isOpenTarget(target)) {
        const via = new URLSearchParams(open[2] ?? '').getAll('via').filter(isServerName);
        return via.length ? { name: 'open', target, via } : { name: 'open', target };
      }
    } catch {
      // Битая percent-кодировка — неизвестный адрес.
    }
  }
  const settings = /^\/settings(?:\/([a-z]+))?$/.exec(path);
  if (settings) {
    const section = settingsSections.find((name) => name === settings[1]);
    if (!settings[1]) return { name: 'settings' };
    if (section) return { name: 'settings', section };
  }
  return { name: 'home' };
}

export function formatRoute(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'room':
      return `#/room/${encodeURIComponent(route.roomId)}${route.thread ? `/thread/${encodeURIComponent(route.thread)}` : ''}`;
    case 'settings':
      return route.section ? `#/settings/${route.section}` : '#/settings';
    case 'open': {
      const via = (route.via ?? []).map((server) => `via=${encodeURIComponent(server)}`).join('&');
      return `#/open/${encodeURIComponent(route.target)}${via ? `?${via}` : ''}`;
    }
  }
}

/** `$opaque` — ID события, без пробелов и управляющих символов. */
export function isEventId(value: string): boolean {
  return /^\$[^\s/]+$/.test(value);
}

/**
 * `!opaque:server` — или `!opaque` без сервера: так выглядят комнаты версии 12. Больше ничего:
 * ни пробелов, ни управляющих символов.
 */
export function isRoomId(value: string): boolean {
  return /^![^\s:/]+(?::[^\s/]+)?$/.test(value);
}

/** Кого или что открывает ссылка: `@local:server`, `#alias:server` или `!id:server`. */
export function isOpenTarget(value: string): boolean {
  return /^[@#][^\s:/]+:[^\s/]+$/.test(value) || isRoomId(value);
}

/** Имя сервера в `via` — хост с портом, без пути и пробелов. */
export function isServerName(value: string): boolean {
  return /^[^\s/?#@]+$/.test(value);
}
