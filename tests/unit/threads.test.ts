import { afterEach, describe, expect, it } from 'vitest';
import { ClientEvent, createClient, PendingEventOrdering, SyncState, type MatrixClient } from 'matrix-js-sdk';
import { DemoHomeserver } from '../../src/core/demo/server';
import { demoRooms, demoUsers } from '../../src/core/demo/fixtures';
import { TimelineStore } from '../../src/core/timeline/timelineStore.svelte.ts';
import { quietLogger } from '../../src/core/support/logger';
import { formatRoute, parseRoute } from '../../src/core/navigation/route';

let client: MatrixClient | undefined;
const stores: TimelineStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.destroy();
  client?.stopClient();
  client = undefined;
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
  const prepared = new Promise<void>((resolve) => client!.on(ClientEvent.Sync, (s) => s === SyncState.Prepared && resolve()));
  await client.startClient({ initialSyncLimit: 20, pendingEventOrdering: PendingEventOrdering.Detached });
  await prepared;
  return { client, server };
}

function open(roomId: string, thread?: string): TimelineStore {
  const store = new TimelineStore(client!, roomId, undefined, thread);
  stores.push(store);
  return store;
}

async function until(condition: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
    for (const store of stores) store.rebuild();
  }
}

const bodies = (s: TimelineStore) => s.messages.map((m) => ('body' in m.kind ? m.kind.body : m.kind.type));
const ROOT = '$quiet-0';

describe('треды', () => {
  it('адрес треда: туда и обратно; кривой ID события — просто чат', () => {
    const route = { name: 'room' as const, roomId: demoRooms.quiet, thread: ROOT };
    expect(parseRoute(formatRoute(route))).toEqual(route);
    expect(parseRoute(`#/room/${encodeURIComponent(demoRooms.quiet)}/thread/nope`)).toEqual({ name: 'room', roomId: demoRooms.quiet });
  });

  it('в общей ленте: строка «3 ответа» под корнем, ответы — без цитаты-подпорки; скрыть — только корень', async () => {
    await started();
    const store = open(demoRooms.quiet);
    expect(store.messages.find((m) => m.eventId === ROOT)?.thread).toBeUndefined();
    store.setThreads({ enabled: true, hidesReplies: false });
    store.rebuild();
    const root = store.messages.find((m) => m.eventId === ROOT)!;
    expect(root.thread).toMatchObject({ replies: 3, latestSender: 'Вера', latest: { kind: 'text', text: 'Приду' } });
    const reply = store.messages.find((m) => m.eventId === '$quiet-thread-1')!;
    expect(reply.threadRootId).toBe(ROOT);
    expect(reply.replyTo).toBeUndefined();
    expect(bodies(store)).toContain('Во сколько?');

    store.setThreads({ enabled: true, hidesReplies: true });
    store.rebuild();
    expect(bodies(store)).not.toContain('Во сколько?');
    expect(store.messages.find((m) => m.eventId === ROOT)?.thread?.replies).toBe(3);
  });

  it('лента треда: корень и ответы с сервера; ответ уходит в тред с подпоркой', async () => {
    const { server } = await started();
    const thread = open(demoRooms.quiet, ROOT);
    await thread.fill(() => true);
    expect(bodies(thread)).toEqual(['Напоминаю: собрание дома в четверг', 'Во сколько?', 'В семь, во дворе', 'Приду']);
    expect(thread.atStart).toBe(true);
    // В треде нет строки треда под корнем и нет полосы непрочитанного.
    expect(thread.messages[0]!.thread).toBeUndefined();

    thread.send('Буду с соседкой');
    await until(() => bodies(thread).includes('Буду с соседкой') && thread.messages.at(-1)!.delivery.state === 'sent');
    const relationOf = (body: string) => {
      const message = thread.messages.find((m) => 'body' in m.kind && m.kind.body === body)!;
      return client!.getRoom(demoRooms.quiet)!.findEventById(message.eventId!)!.getWireContent()['m.relates_to'];
    };
    expect(relationOf('Буду с соседкой')).toEqual({ rel_type: 'm.thread', event_id: ROOT, is_falling_back: true, 'm.in_reply_to': { event_id: '$quiet-thread-2' } });

    // Ответ на конкретное сообщение в треде — настоящая цитата.
    thread.send('Да', thread.messages[1]);
    await until(() => bodies(thread).includes('Да') && thread.messages.at(-1)!.delivery.state === 'sent');
    expect(relationOf('Да')).toMatchObject({ is_falling_back: false, 'm.in_reply_to': { event_id: '$quiet-thread-0' } });
    expect(server.unknown).toEqual([]);
  });
});
