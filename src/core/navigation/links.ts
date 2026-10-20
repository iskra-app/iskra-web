/**
 * Ссылки на людей и комнаты.
 *
 * Пишем свои — `https://s.iskra.wtf/<id>`: страница-визитка Искры, как `matrix.to`, только
 * с кнопкой «Открыть в Iskra Web». Человек — `/@u:server`, адрес — `/%23alias:server` (голый
 * `#` браузер принял бы за якорь), ID комнаты — `/!id:server?via=…`.
 *
 * Читаем и свои, и `matrix.to`: в чужих сообщениях ссылки чаще всего оттуда. Упоминания в
 * поле ввода остаются `matrix.to` — так велит спецификация, и их читают другие клиенты.
 */
import { isOpenTarget, isServerName } from './route';

export const LINK_HOST = 's.iskra.wtf';

/** Ссылка, которой делятся: в QR-коде, «Поделиться», «Скопировать». */
export function shareLink(id: string, via: string[] = []): string {
  const query = via.map((server) => `via=${encodeURIComponent(server)}`).join('&');
  // `encodeURIComponent` кодирует и `:` — читается хуже, а нужен только `#`.
  return `https://${LINK_HOST}/${encodeURIComponent(id).replace(/%3A/gi, ':').replace(/%40/g, '@')}${query ? `?${query}` : ''}`;
}

export interface LinkTarget {
  target: string;
  via?: string[];
}

/**
 * На кого или что указывает ссылка — `matrix.to/#/<id>` или `s.iskra.wtf/<id>` (и
 * `s.iskra.wtf/#<id>`, во что превращается адрес с некодированным `#`). Иначе `undefined`.
 */
export function linkTarget(href: string): LinkTarget | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  if (url.hostname === 'matrix.to') return fromHash(url.hash, false);
  if (url.hostname !== LINK_HOST) return undefined;
  const path = url.pathname.replace(/^\/+/, '');
  if (path) return target(path, url.searchParams);
  return fromHash(url.hash, true);
}

/** `#/<id>?via=…`; у своих ещё `#alias:server` — адрес без закодированного `#`. */
function fromHash(hash: string, bareAlias: boolean): LinkTarget | undefined {
  let rest = hash.replace(/^#/, '');
  if (rest.startsWith('/')) rest = rest.slice(1);
  else if (!bareAlias) return undefined;
  const at = rest.indexOf('?');
  const id = at < 0 ? rest : rest.slice(0, at);
  const query = new URLSearchParams(at < 0 ? '' : rest.slice(at + 1));
  return target(bareAlias && /^[^@#!/]/.test(id) ? `#${id}` : id, query);
}

function target(encoded: string, query: URLSearchParams): LinkTarget | undefined {
  // Ссылка на событие (`/!room:server/$event`) — всё равно на комнату.
  const first = encoded.split('/')[0] ?? '';
  let id: string;
  try {
    id = decodeURIComponent(first);
  } catch {
    return undefined;
  }
  if (!isOpenTarget(id)) return undefined;
  const via = query.getAll('via').filter(isServerName);
  return via.length ? { target: id, via } : { target: id };
}
