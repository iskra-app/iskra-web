import { afterEach, expect, it } from 'vitest';
import { ClientEvent, createClient, PendingEventOrdering, SyncState, type MatrixClient } from 'matrix-js-sdk';
import { DemoHomeserver } from '../../src/core/demo/server';
import { demoRooms, demoUsers } from '../../src/core/demo/fixtures';
import { TimelineStore } from '../../src/core/timeline/timelineStore.svelte.ts';
import { quietLogger } from '../../src/core/support/logger';

// Свой файл: у Vitest модули свежие на файл, и разбор Markdown здесь ещё не загружен.

let client: MatrixClient | undefined;
let store: TimelineStore | undefined;

afterEach(() => {
  store?.destroy();
  client?.stopClient();
  client = store = undefined;
});

it('отправленное до загрузки Markdown уходит, в том порядке, в каком набрано, и с разметкой', async () => {
  const server = new DemoHomeserver();
  client = createClient({
    baseUrl: server.baseUrl,
    fetchFn: server.fetch,
    logger: quietLogger(),
    userId: demoUsers.alice,
    deviceId: 'DEMODEVICE',
    accessToken: 'demo-token-DEMODEVICE',
  });
  const prepared = new Promise<void>((resolve) => client!.on(ClientEvent.Sync, (s) => s === SyncState.Prepared && resolve()));
  await client.startClient({ initialSyncLimit: 20, pendingEventOrdering: PendingEventOrdering.Detached });
  await prepared;

  store = new TimelineStore(client, demoRooms.weekend);
  store.send('Первое');
  store.send('*Второе*');
  store.send('Третье');
  const start = Date.now();
  const mine = () => store!.messages.filter((m) => m.own && m.kind.type === 'text');
  while (mine().length < 3 || mine().some((m) => m.delivery.state !== 'sent')) {
    if (Date.now() - start > 8000) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
    store.rebuild();
  }
  const kinds = mine().map((m) => m.kind as { body: string; html?: string });
  expect(kinds.map((k) => k.body)).toEqual(['Первое', '**Второе**', 'Третье']);
  // Одна звёздочка стала двумя и жирным — значит, ждали разбора, а не ушли голым текстом.
  expect(kinds[1]!.html).toContain('<strong>Второе</strong>');
  expect(server.unknown).toEqual([]);
});
