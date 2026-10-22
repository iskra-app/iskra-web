/**
 * Адрес, который прислал сервер, — прежде чем по нему ходить с токеном или вести туда человека.
 *
 * Только `https:`; `http:` — лишь для своего компьютера (локальный Synapse при разработке), как
 * в поле адреса аккаунта. Без имени и пароля в адресе. Иначе — `null`: `javascript:`, `data:`,
 * открытый `http:` чужого хоста. CSP и так не дала бы исполнить первое и сходить во второе, но
 * ссылку, которая никуда не ведёт или ведёт открытым текстом, показывать незачем.
 */
const LOCAL = ['localhost', '127.0.0.1', '[::1]'];

export function secureUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && LOCAL.includes(url.hostname)) return url;
  return null;
}
