import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { ClientEvent, createClient, PendingEventOrdering, SyncState, type MatrixClient } from 'matrix-js-sdk';
import { DemoHomeserver } from '../../src/core/demo/server';
import { demoRooms, demoUsers } from '../../src/core/demo/fixtures';
import { quietLogger } from '../../src/core/support/logger';
import { matches, queryTerms, termsOf } from '../../src/core/search/terms';
import { SearchIndex } from '../../src/core/search/searchIndex';
import { MessageIndexer, MessageSearch } from '../../src/core/search/messageSearch.svelte.ts';

describe('слова для индекса', () => {
  it('начала слов от двух букв, без регистра и диакритики; длинное — обрезано', () => {
    expect(termsOf('Ёлка, Café!')).toEqual(['ел', 'елк', 'елка', 'ca', 'caf', 'cafe']);
    expect(termsOf('а')).toEqual([]);
    expect(termsOf('электрификация').at(-1)).toBe('электрификац');
    expect(queryTerms('Собр')).toEqual(['собр']);
    expect(queryTerms('ё')).toEqual([]);
  });

  it('письменности без пробелов — парами знаков', () => {
    expect(termsOf('東京都')).toEqual(['東京', '京都']);
    expect(queryTerms('京都')).toEqual(['京都']);
    expect(matches('東京都へ', '京都')).toBe(true);
  });

  it('сверка: каждое слово запроса — начало слова текста', () => {
    expect(matches('Собрание дома в четверг', 'собр четв')).toBe(true);
    expect(matches('Собрание дома в четверг', 'брание')).toBe(false);
    expect(matches('электрификация', 'электрификацию')).toBe(false);
  });
});

describe('индекс на устройстве', () => {
  const name = () => `test-search-${Math.random()}`;

  it('находит по всем словам, свежее первым; чат — тоже условие; стёртое не находится', async () => {
    const index = await SearchIndex.open(name());
    await index.put([
      { eventId: '$1', roomId: '!a', ts: 1, sender: '@v', text: 'Собрание дома в четверг' },
      { eventId: '$2', roomId: '!b', ts: 2, sender: '@b', text: 'Собрание жильцов' },
      { eventId: '$3', roomId: '!a', ts: 3, sender: '@v', text: 'Про четверг всё в силе' },
    ]);
    expect((await index.search('собр')).map((e) => e.eventId)).toEqual(['$2', '$1']);
    expect((await index.search('собр четв')).map((e) => e.eventId)).toEqual(['$1']);
    expect((await index.search('собр', { roomId: '!a' })).map((e) => e.eventId)).toEqual(['$1']);
    expect(await index.search('с')).toEqual([]);
    await index.remove(['$1']);
    expect((await index.search('четверг')).map((e) => e.eventId)).toEqual(['$3']);
    // Правка — тот же ID с новыми словами; пустой текст — записи нет.
    await index.put([{ eventId: '$3', roomId: '!a', ts: 3, sender: '@v', text: 'Перенесли' }]);
    expect(await index.search('четверг')).toEqual([]);
    expect((await index.search('перенес'))[0]).toMatchObject({ sender: '@v', text: 'Перенесли' });
    expect(await index.size()).toBeGreaterThan(0);
    // Удаление событием — только своё и только в своём чате: ID из другого чата или чужое
    // сообщение без права модератора не стирают.
    await index.removeRedacted('$2', '!a', '@b', false);
    await index.removeRedacted('$2', '!b', '@v', false);
    expect((await index.search('жильцов')).map((e) => e.eventId)).toEqual(['$2']);
    await index.removeRedacted('$2', '!b', '@b', false);
    expect(await index.search('жильцов')).toEqual([]);
    await index.put([{ eventId: '$2', roomId: '!b', ts: 2, sender: '@b', text: 'Собрание жильцов' }]);
    await index.removeRedacted('$2', '!b', '@moderator', true);
    expect(await index.search('жильцов')).toEqual([]);
    await index.put([{ eventId: '$2', roomId: '!b', ts: 2, sender: '@b', text: 'Собрание жильцов' }]);
    // Ушли из чата — всё его, и только его.
    await index.removeRoom('!a');
    expect(await index.search('перенес')).toEqual([]);
    expect((await index.search('собр')).map((e) => e.eventId)).toEqual(['$2']);
    index.close();
  });

  it('на диске ни слова открытым: только отпечатки и шифр', async () => {
    const db = name();
    const index = await SearchIndex.open(db);
    await index.put([{ eventId: '$1', roomId: '!a', ts: 1, sender: '@vera:x', text: 'секретное слово' }]);
    index.close();
    const raw = await new Promise<unknown[]>((resolve) => {
      const open = indexedDB.open(db);
      open.onsuccess = () => {
        const all = open.result.transaction('docs').objectStore('docs').getAll();
        all.onsuccess = () => {
          resolve(all.result);
          open.result.close();
        };
      };
    });
    const dump = JSON.stringify(raw, (_key, value: unknown) => (value instanceof ArrayBuffer ? new TextDecoder().decode(value) : value));
    expect(dump).not.toMatch(/секр|слово|vera/);
  });
});

let client: MatrixClient | undefined;
let indexer: MessageIndexer | undefined;
afterEach(() => {
  indexer?.destroy();
  client?.stopClient();
  client = indexer = undefined;
});

async function started() {
  const server = new DemoHomeserver();
  client = createClient({
    baseUrl: server.baseUrl,
    fetchFn: server.fetch,
    logger: quietLogger(),
    userId: demoUsers.alice,
    deviceId: 'DEMODEVICE',
    accessToken: 'demo-token-DEMODEVICE',
  });
  indexer = new MessageIndexer(client, `test-search-${Math.random()}`);
  const prepared = new Promise<void>((resolve) => client!.on(ClientEvent.Sync, (s) => s === SyncState.Prepared && resolve()));
  await client.startClient({ initialSyncLimit: 20, pendingEventOrdering: PendingEventOrdering.Detached });
  await prepared;
  return { client, server, indexer };
}

async function until(condition: () => boolean | Promise<boolean>, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('индекс сообщений на демо-сервере', () => {
  it('то, что пришло с синхронизацией, находится; в чате — только его', async () => {
    const { indexer } = await started();
    const found = await indexer.search('собрание');
    expect(found.map((e) => e.eventId)).toContain('$quiet-0');
    expect(found.find((e) => e.eventId === '$quiet-0')).toMatchObject({ roomId: demoRooms.quiet, text: 'Напоминаю: собрание дома в четверг' });
    expect(await indexer.search('собрание', demoRooms.weekend)).toEqual([]);
  });

  it('догруженное листанием назад — тоже: старого, которого не открывали, — нет', async () => {
    const { client, indexer } = await started();
    expect(await indexer.search('номер 36')).toEqual([]);
    const room = client.getRoom(demoRooms.history)!;
    await client.paginateEventTimeline(room.getLiveTimeline(), { backwards: true, limit: 50 });
    expect((await indexer.search('номер 36')).map((e) => e.text)).toContain('Сообщение номер 366');
  });

  it('новое — находится, правка — по новым словам, удалённое — нет', async () => {
    const { client, indexer } = await started();
    const { event_id } = await client.sendTextMessage(demoRooms.quiet, 'Шлагбаум сломался');
    await until(async () => (await indexer.search('шлагб')).length === 1);

    await client.sendMessage(demoRooms.quiet, {
      msgtype: 'm.text',
      body: '* Шлагбаум починили',
      'm.new_content': { msgtype: 'm.text', body: 'Шлагбаум починили' },
      'm.relates_to': { rel_type: 'm.replace', event_id },
    } as never);
    await until(async () => (await indexer.search('починили')).length === 1);
    expect(await indexer.search('сломался')).toEqual([]);

    await client.redactEvent(demoRooms.quiet, event_id);
    await until(async () => (await indexer.search('шлагб')).length === 0);
  });

  it('удалённое, которого нет в загруженной ленте, — тоже не находится', async () => {
    const { client, indexer } = await started();
    const { event_id } = await client.sendTextMessage(demoRooms.quiet, 'Код от подъезда 4512');
    await until(async () => (await indexer.search('подъезда')).length === 1);
    // Лента сброшена — как после долгого перерыва: самого сообщения в памяти больше нет.
    client.getRoom(demoRooms.quiet)!.resetLiveTimeline(null, null);
    expect(client.getRoom(demoRooms.quiet)!.findEventById(event_id)).toBeUndefined();
    await client.redactEvent(demoRooms.quiet, event_id);
    await until(async () => (await indexer.search('подъезда')).length === 0);
  });

  it('ушли из чата — его переписка больше не находится, чужая — на месте', async () => {
    const { client, indexer } = await started();
    expect((await indexer.search('собрание', demoRooms.quiet)).length).toBeGreaterThan(0);
    const elsewhere = (await indexer.search('собрание')).filter((e) => e.roomId !== demoRooms.quiet).length;
    await client.leave(demoRooms.quiet);
    await until(async () => (await indexer.search('собрание', demoRooms.quiet)).length === 0);
    expect((await indexer.search('собрание')).filter((e) => e.roomId !== demoRooms.quiet).length).toBe(elsewhere);
  });

  it('поиск, как его видит человек: две буквы, пауза, «ничего не нашлось»', async () => {
    const { indexer } = await started();
    const search = new MessageSearch(indexer, (_room, sender) => (sender === demoUsers.vera ? 'Вера' : sender));
    search.search('с');
    expect(search.searching).toBe(false);
    search.search('во сколько');
    expect(search.searching).toBe(true);
    await until(() => !search.searching);
    expect(search.hits.map((h) => h.id)).toEqual(['$anya-4', '$quiet-thread-0']);
    expect(search.hits[1]).toMatchObject({ roomId: demoRooms.quiet, senderName: 'Вера', excerpt: 'Во сколько?' });
    search.search('йцукен');
    await until(() => !search.searching);
    expect(search.foundNothing).toBe(true);
    search.destroy();
  });
});
