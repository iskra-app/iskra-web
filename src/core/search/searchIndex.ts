/**
 * Поисковый индекс сообщений — на устройстве и зашифрованный, как у нативной Искры.
 *
 * Сервер в поиске не участвует вовсе: в зашифрованном чате он искать не может, а вопрос к
 * нему рассказал бы, что человек ищет. Поэтому слова собираются здесь, из того, что клиент
 * уже расшифровал и показал.
 *
 * На диске нет ни одного слова открытым:
 * - текст и отправитель — под AES-GCM (`secretBox.ts`);
 * - вместо слов — их отпечатки, HMAC-SHA-256 (первые 12 байт). По отпечатку слово не
 *   восстановить, а равные слова дают равные отпечатки — этого и хватает, чтобы искать.
 *
 * Оба ключа — неизвлекаемые, свои у индекса: лежат в его же базе и уходят вместе с ней.
 * «Очистить поисковый индекс» стирает базу целиком, и новый индекс получает новые ключи.
 * Что это даёт и чего нет — как у `vault.ts`: от скопированного с диска профиля браузера
 * защищает, от кода на нашем же origin — нет, граница там — CSP.
 *
 * Чат тоже ищется отпечатком: «в этом чате» — ещё одно слово запроса.
 */
import { deleteDatabase, openDatabase, request } from '../storage/idb';
import { createSealingKey, seal, unseal, type Sealed } from '../storage/secretBox';
import { matches, queryTerms, termsOf } from './terms';

const DB_VERSION = 1;
const DOCS = 'docs';
const META = 'meta';
const KEYS_ID = 'keys';
/** Сколько байт отпечатка хранить: 96 бит — совпасть случайно им не с чего. */
const BLIND_BYTES = 12;

export function searchDatabaseName(userId: string): string {
  return `iskra-search-${userId}`;
}

/** Что кладут в индекс: сообщение, каким его видно сейчас. */
export interface IndexEntry {
  eventId: string;
  roomId: string;
  ts: number;
  sender: string;
  text: string;
}

interface StoredDoc {
  eventId: string;
  roomId: string;
  ts: number;
  terms: string[];
  sealed: Sealed;
}

interface Keys {
  id: typeof KEYS_ID;
  seal: CryptoKey;
  blind: CryptoKey;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export class SearchIndex {
  private constructor(
    private readonly db: IDBDatabase,
    private readonly keys: Keys,
  ) {
    // Базу удаляют («Очистить поисковый индекс», выход) — отпустить её, а не держать удаление.
    db.onversionchange = () => db.close();
  }

  /** Открывает индекс аккаунта; ключей ещё нет — заводит. Одно соединение на всю сессию. */
  static async open(name: string): Promise<SearchIndex> {
    const db = await openDatabase(name, DB_VERSION, (db) => {
      if (!db.objectStoreNames.contains(DOCS)) {
        const docs = db.createObjectStore(DOCS, { keyPath: 'eventId' });
        docs.createIndex('terms', 'terms', { multiEntry: true });
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
    });
    let keys = await request(db.transaction(META).objectStore(META).get(KEYS_ID) as IDBRequest<Keys | undefined>);
    if (!keys) {
      keys = {
        id: KEYS_ID,
        seal: await createSealingKey(),
        blind: await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
      };
      const tx = db.transaction(META, 'readwrite');
      tx.objectStore(META).put(keys);
      await done(tx);
    }
    return new SearchIndex(db, keys);
  }

  static destroy(name: string): Promise<void> {
    return deleteDatabase(name);
  }

  close(): void {
    this.db.close();
  }

  private async blind(term: string): Promise<string> {
    const signature = await crypto.subtle.sign('HMAC', this.keys.blind, new TextEncoder().encode(term));
    return toBase64(new Uint8Array(signature, 0, BLIND_BYTES));
  }

  private roomTerm(roomId: string): Promise<string> {
    // Не слово сообщения: у слов нет двоеточия и восклицательного знака.
    return this.blind(`!room ${roomId}`);
  }

  /** Записать или заменить. Пустой текст — сообщения в индексе нет. */
  async put(entries: readonly IndexEntry[]): Promise<void> {
    const docs: StoredDoc[] = [];
    const empty: string[] = [];
    // Всё шифруется до транзакции: она закрывается на первом же `await`.
    for (const entry of entries) {
      const words = termsOf(entry.text);
      if (!words.length) {
        empty.push(entry.eventId);
        continue;
      }
      const terms = await Promise.all([this.roomTerm(entry.roomId), ...words.map((word) => this.blind(word))]);
      docs.push({
        eventId: entry.eventId,
        roomId: entry.roomId,
        ts: entry.ts,
        terms,
        sealed: await seal(this.keys.seal, { sender: entry.sender, text: entry.text }),
      });
    }
    const tx = this.db.transaction(DOCS, 'readwrite');
    const store = tx.objectStore(DOCS);
    for (const doc of docs) store.put(doc);
    for (const id of empty) store.delete(id);
    await done(tx);
  }

  async remove(eventIds: readonly string[]): Promise<void> {
    if (!eventIds.length) return;
    const tx = this.db.transaction(DOCS, 'readwrite');
    const store = tx.objectStore(DOCS);
    for (const id of eventIds) store.delete(id);
    await done(tx);
  }

  /**
   * Найти: все слова запроса, свежие первыми, не больше `limit`. Расшифровывается только
   * найденное, и только пока не набралось `limit`.
   */
  async search(query: string, options: { roomId?: string; limit?: number } = {}): Promise<IndexEntry[]> {
    const words = queryTerms(query);
    if (!words.length) return [];
    const terms = await Promise.all([...words.map((word) => this.blind(word)), ...(options.roomId ? [this.roomTerm(options.roomId)] : [])]);
    const limit = options.limit ?? 50;

    const tx = this.db.transaction(DOCS);
    const byTerm = tx.objectStore(DOCS).index('terms');
    const lists = await Promise.all(terms.map((term) => request(byTerm.getAllKeys(term) as IDBRequest<string[]>)));
    lists.sort((a, b) => a.length - b.length);
    let found = new Set(lists[0]);
    for (const list of lists.slice(1)) {
      if (!found.size) break;
      const next = new Set(list);
      found = new Set([...found].filter((id) => next.has(id)));
    }
    if (!found.size) return [];

    const store = this.db.transaction(DOCS).objectStore(DOCS);
    const docs = (await Promise.all([...found].map((id) => request(store.get(id) as IDBRequest<StoredDoc | undefined>)))).filter((doc) => !!doc);
    docs.sort((a, b) => b.ts - a.ts);

    const hits: IndexEntry[] = [];
    for (const doc of docs) {
      if (hits.length >= limit) break;
      const open = await unseal<{ sender: string; text: string }>(this.keys.seal, doc.sealed).catch(() => undefined);
      if (!open || !matches(open.text, query)) continue;
      hits.push({ eventId: doc.eventId, roomId: doc.roomId, ts: doc.ts, sender: open.sender, text: open.text });
    }
    return hits;
  }

  /** Сколько места занимает — по записям, для «Хранилища». */
  async size(): Promise<number> {
    const store = this.db.transaction(DOCS).objectStore(DOCS);
    return new Promise((resolve, reject) => {
      let bytes = 0;
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const at = cursor.result;
        if (!at) return resolve(bytes);
        const doc = at.value as StoredDoc;
        bytes += doc.sealed.data.byteLength + doc.sealed.iv.byteLength + doc.terms.length * 16 + doc.eventId.length + doc.roomId.length + 8;
        at.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
  }
}
