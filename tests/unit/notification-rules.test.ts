import { afterEach, describe, expect, it } from 'vitest';
import { ClientEvent, createClient, SyncState, type IPushRules, type MatrixClient } from 'matrix-js-sdk';
import { DemoHomeserver } from '../../src/core/demo/server';
import { demoUsers } from '../../src/core/demo/fixtures';
import { accountAlerts, defaultAlertsWrites, switchWrites } from '../../src/core/rooms/pushRules';
import { NotificationRules } from '../../src/core/session/notificationRules.svelte.ts';
import { quietLogger } from '../../src/core/support/logger';

let client: MatrixClient | undefined;
let rules: NotificationRules | undefined;
afterEach(() => {
  rules?.destroy();
  client?.stopClient();
  client = rules = undefined;
});

async function started(refuse = () => false) {
  const server = new DemoHomeserver();
  const fetchFn: typeof fetch = (input, init) =>
    init?.method === 'PUT' && String(input).includes('/pushrules/') && refuse()
      ? Promise.resolve(new Response(JSON.stringify({ errcode: 'M_UNKNOWN', error: 'nope' }), { status: 500 }))
      : server.fetch(input, init);
  client = createClient({
    baseUrl: server.baseUrl,
    fetchFn,
    logger: quietLogger(),
    userId: demoUsers.alice,
    deviceId: 'DEMODEVICE',
    accessToken: 'demo-token-DEMODEVICE',
  });
  const prepared = new Promise<void>((resolve) => client!.on(ClientEvent.Sync, (s) => s === SyncState.Prepared && resolve()));
  await client.startClient({ initialSyncLimit: 5 });
  await prepared;
  rules = new NotificationRules(client);
  await rules.load();
  return { client, server, rules };
}

const actionsOf = (c: MatrixClient, ruleId: string) => c.pushRules?.global?.underride?.find((r) => r.rule_id === ruleId)?.actions;

describe('уведомления аккаунта: чтение', () => {
  it('правил нет — в силе «да», как у Matrix; умолчание без notify — «только упоминания»', () => {
    expect(accountAlerts({ global: {} } as IPushRules)).toEqual({
      direct: 'all', groups: 'all', mentionsMe: true, roomMentions: true, invitations: true, calls: true,
    });
    const quiet = {
      global: {
        underride: [{ rule_id: '.m.rule.encrypted', default: true, enabled: true, actions: [] }],
        override: [{ rule_id: '.m.rule.invite_for_me', default: true, enabled: false, actions: ['notify'] }],
      },
    } as unknown as IPushRules;
    expect(accountAlerts(quiet)).toMatchObject({ groups: 'mentions', direct: 'all', invitations: false });
  });

  it('пишутся только правила, которые есть у сервера, и устаревшие — вместе с новым', () => {
    const present = {
      global: {
        override: [
          { rule_id: '.m.rule.is_user_mention', default: true, enabled: true, actions: ['notify'] },
          { rule_id: '.m.rule.contains_display_name', default: true, enabled: true, actions: ['notify'] },
        ],
        underride: [{ rule_id: '.m.rule.message', default: true, enabled: false, actions: [] }],
      },
    } as unknown as IPushRules;
    expect(switchWrites(present, 'mentionsMe', false).map((w) => w.ruleId)).toEqual(['.m.rule.is_user_mention', '.m.rule.contains_display_name']);
    // Выключенное правило «всех» не даст — его ещё и включают.
    expect(defaultAlertsWrites(present, 'groups', 'all')).toEqual([
      { kind: 'underride', ruleId: '.m.rule.message', actions: ['notify'] },
      { kind: 'underride', ruleId: '.m.rule.message', enabled: true },
    ]);
  });
});

describe('уведомления аккаунта на демо-сервере', () => {
  it('группы — «только упоминания» в обе половины пары; личные не тронуты; обратно — со звуком у личных', async () => {
    const { client, server, rules } = await started();
    expect(rules.current).toMatchObject({ direct: 'all', groups: 'all' });

    await rules.setDefault('groups', 'mentions');
    expect(rules.failure).toBeNull();
    expect(rules.current?.groups).toBe('mentions');
    expect(actionsOf(client, '.m.rule.encrypted')).toEqual([]);
    expect(actionsOf(client, '.m.rule.message')).toEqual([]);
    expect(actionsOf(client, '.m.rule.encrypted_room_one_to_one')).toContain('notify');

    await rules.setDefault('direct', 'mentions');
    await rules.setDefault('direct', 'all');
    expect(actionsOf(client, '.m.rule.room_one_to_one')).toEqual(['notify', { set_tweak: 'sound', value: 'default' }]);
    expect(server.unknown).toEqual([]);
  });

  it('переключатели: выключил — правило выключено на сервере и в другом клиенте видно', async () => {
    const { client, server, rules } = await started();
    await rules.setSwitch('invitations', false);
    await rules.setSwitch('calls', false);
    expect(rules.current).toMatchObject({ invitations: false, calls: false, mentionsMe: true });
    expect(client.pushRules?.global?.override?.find((r) => r.rule_id === '.m.rule.invite_for_me')?.enabled).toBe(false);

    const other = new NotificationRules(client);
    expect(other.current).toMatchObject({ invitations: false, calls: false });
    other.destroy();
    expect(server.unknown).toEqual([]);
  });

  it('сервер отказал — переключатель на месте, и сказано, какой', async () => {
    let refusing = false;
    const { rules } = await started(() => refusing);
    refusing = true;
    await rules.setSwitch('mentionsMe', false);
    expect(rules.current?.mentionsMe).toBe(true);
    expect(rules.failure).toBe('mentionFailed');
    await rules.setDefault('groups', 'mentions');
    expect(rules.current?.groups).toBe('all');
    expect(rules.failure).toBe('groupFailed');
  });
});
