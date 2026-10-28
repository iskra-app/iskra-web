/**
 * Свои секреты под неизвлекаемым ключом: AES-GCM, `extractable: false`.
 *
 * Честно о том, что это даёт (см. план, «Хранение»): немного. Ключ не спасает от кода на нашем
 * же origin — такой код сам может им пользоваться. И не спасает от копии профиля браузера:
 * Chromium и Firefox кладут неизвлекаемый `CryptoKey` в ту же IndexedDB, его байты — на диске
 * рядом с шифротекстом, без ключницы системы. Спасает он от беглого взгляда: токена нет
 * строкой ни в файлах профиля, ни в выгрузке IndexedDB из DevTools. Граница безопасности
 * веб-клиента — CSP и шифрование диска самой системы, а не это.
 *
 * Это не Matrix-криптография: вся она — Rust-овская, внутри `matrix-js-sdk`.
 */

export interface Sealed {
  iv: Uint8Array;
  data: ArrayBuffer;
}

export function createSealingKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return { iv, data };
}

export async function unseal<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv as Uint8Array<ArrayBuffer> }, key, sealed.data);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** Случайные байты в base64 — для ключа криптохранилища, который лежит под `seal`. */
export function randomBase64(bytes: number): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...raw));
}

export function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
