import { afterEach, describe, expect, it } from 'vitest';
import { ClientEvent, createClient, SyncState, type MatrixClient } from 'matrix-js-sdk';
import { DemoHomeserver } from '../../src/core/demo/server';
import { demoUsers } from '../../src/core/demo/fixtures';
import { quietLogger } from '../../src/core/support/logger';
import { applyPresence, presenceFrom, PresenceWatch } from '../../src/core/session/presence.svelte.ts';
import { presenceLabel } from '../../src/features/room/presenceLabel';
import { i18n } from '../../src/i18n/index.svelte.ts';

const NOW = new Date(2026, 9, 20, 15, 0).getTime();
const MIN = 60_000;
const before = i18n.locale;
let client: MatrixClient | undefined;
afterEach(() => {
  i18n.locale = before;
  client?.stopClient();
  client = undefined;
});

/** Клиент на демо-сервере; `seen` — каждый запрос: метод, адрес, тело. */
async function started(): Promise<{ client: MatrixClient; seen: string[] }> {
  const server = new DemoHomeserver();
  const seen: string[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    seen.push(`${request.method} ${request.url} ${init?.body ?? ''}`);
    return server.fetch(input, init);
  };
  client = createClient({ baseUrl: server.baseUrl, fetchFn, logger: quietLogger(), userId: demoUsers.alice, deviceId: 'D', accessToken: 'demo-token-D' });
  const prepared = new Promise<void>((resolve) => client!.on(ClientEvent.Sync, (s) => s === SyncState.Prepared && resolve()));
  await client.startClient({ initialSyncLimit: 1 });
  await prepared;
  return { client, seen };
}

async function until(condition: () => boolean, ms = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('присутствие', () => {
  it('выключенное на сервере — `offline` без времени — не показывается вовсе', () => {
    expect(presenceFrom({ presence: 'offline' }, NOW)).toBeNull();
    expect(presenceFrom({ presence: 'online' }, NOW)).toEqual({ online: true });
    expect(presenceFrom({ presence: 'unavailable', currently_active: true }, NOW)).toEqual({ online: true });
    expect(presenceFrom({ presence: 'offline', last_active_ago: 5 * MIN }, NOW)).toEqual({ online: false, lastActive: NOW - 5 * MIN });
  });

  it('подпись: в сети, только что, минуты, часы до двенадцати, время, вчера, дата', () => {
    i18n.locale = 'ru';
    const at = (agoMs: number) => presenceLabel({ online: false, lastActive: NOW - agoMs }, NOW, 'ru');
    expect(presenceLabel({ online: true }, NOW, 'ru')).toBe('в сети');
    expect(at(20_000)).toBe('был(а) только что');
    expect(at(-5_000)).toBe('был(а) только что');
    expect(at(5 * MIN)).toBe('был(а) 5 мин назад');
    expect(at(3 * 60 * MIN)).toBe('был(а) 3 ч назад');
    // 15:00 минус 14 часов — 01:00 того же дня: уже не «ч назад», а время.
    expect(at(14 * 60 * MIN)).toBe('был(а) в 01:00');
    expect(at(20 * 60 * MIN)).toBe('был(а) вчера');
    expect(at(5 * 24 * 60 * MIN)).toBe('был(а) 15.10.26');
  });
});

describe('присутствие на демо-сервере', () => {
  it('скрыто — серверу «offline»: отдельным запросом и в каждой синхронизации', async () => {
    const { client, seen } = await started();
    await applyPresence(client, true);
    expect(seen.some((r) => r.startsWith('PUT') && r.includes('/presence/') && r.includes('"offline"'))).toBe(true);
    // Идущая синхронизация досиживает свой длинный опрос (до 5 с), следующая — уже с `offline`.
    await until(() => seen.some((r) => r.startsWith('GET') && r.includes('/sync') && r.includes('set_presence=offline')), 25_000);
  }, 30_000);

  it('о собеседнике — что сказал сервер; молчащий сервер — ничего', async () => {
    const { client } = await started();
    const anya = new PresenceWatch(client, demoUsers.anya);
    const vera = new PresenceWatch(client, demoUsers.vera);
    await until(() => anya.presence !== null);
    expect(anya.presence!.online).toBe(false);
    expect(Date.now() - anya.presence!.lastActive!).toBeGreaterThanOrEqual(5 * MIN - 1000);
    await new Promise((r) => setTimeout(r, 100));
    expect(vera.presence).toBeNull();
    anya.destroy();
    vera.destroy();
  });
});
