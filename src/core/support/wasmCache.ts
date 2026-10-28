/**
 * Лечение испорченного кеша WASM.
 *
 * Если сервер хоть раз отдал `.wasm` без `application/wasm`, браузер запомнил этот ответ вместе
 * с типом (у файлов с хэшем в имени кеш долгий), и Rust-крипто не компилируется, пока запись не
 * заменят: «Incorrect response MIME type». Сервер к тому времени уже исправлен, а кеш у человека
 * нет. Здесь — как заменить его без «очистите весь кеш».
 */

/** Сообщение браузера о том, что `.wasm` пришёл с чужим типом. */
export function isWasmMimeError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /MIME type/i.test(text) && /wasm/i.test(text);
}

/** Адреса `.wasm`, которые страница уже запрашивала, — без повторов. */
function loadedWasmUrls(): string[] {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return [];
  const urls = performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => /\.wasm(?:$|\?)/.test(name));
  return [...new Set(urls)];
}

/**
 * Заново скачивает `.wasm` мимо кеша (`cache: 'reload'` ещё и перезаписывает запись в HTTP-кеше)
 * и убирает его из Cache Storage service worker-а. Остальной кеш — оболочка, шрифты — не трогает.
 * Ничего не бросает: не вышло — страница всё равно перезагрузится, хуже не будет.
 */
export async function refreshWasm(): Promise<void> {
  await Promise.all(loadedWasmUrls().map((url) => fetch(url, { cache: 'reload' }).catch(() => undefined)));
  if (typeof caches === 'undefined') return;
  try {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (/\.wasm(?:$|\?)/.test(request.url)) await cache.delete(request);
      }
    }
  } catch {
    // Cache Storage недоступен — остаётся то, что сделал `fetch` выше.
  }
}
