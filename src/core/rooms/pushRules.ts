/**
 * Беззвучность читается из push rules, а не угадывается по отсутствию числа (см. план).
 *
 * «Беззвучный» — так, как его пишут клиенты Matrix (Element, нативная Искра через SDK):
 * правило `override` с `rule_id` = ID комнаты, одним условием `room_id` и без действия
 * `notify`. Правило `room` без `notify` — это «только упоминания», не беззвучие.
 */
import type { IPushRules } from 'matrix-js-sdk';

export function mutedRoomIds(rules: IPushRules | undefined): Set<string> {
  const muted = new Set<string>();
  for (const rule of rules?.global?.override ?? []) {
    if (!rule.enabled) continue;
    const conditions = rule.conditions ?? [];
    const matchesOnlyThisRoom =
      conditions.length === 1 &&
      conditions[0]?.kind === 'event_match' &&
      (conditions[0] as { key?: string }).key === 'room_id' &&
      (conditions[0] as { pattern?: string }).pattern === rule.rule_id;
    if (!matchesOnlyThisRoom) continue;
    const notifies = rule.actions.some((action) => action === 'notify');
    if (!notifies) muted.add(rule.rule_id);
  }
  return muted;
}

/**
 * Как громко комната может отвлекать — три ответа, как в нативной Искре (`RoomAlerts`):
 * все сообщения, только упоминания, выключено. «Как по умолчанию» четвёртым не
 * предлагается: он неотличим от того из трёх, к которому сейчас сводится.
 */
export type RoomAlerts = 'all' | 'mentions' | 'muted';

const onlyThisRoom = (rule: { rule_id: string; conditions?: unknown[] }) => {
  const conditions = (rule.conditions ?? []) as Array<{ kind?: string; key?: string; pattern?: string }>;
  return conditions.length === 1 && conditions[0]?.kind === 'event_match' && conditions[0].key === 'room_id' && conditions[0].pattern === rule.rule_id;
};

export function roomAlerts(rules: IPushRules | undefined, roomId: string): RoomAlerts {
  const override = rules?.global?.override?.find((r) => r.rule_id === roomId && r.enabled && onlyThisRoom(r));
  if (override && !override.actions.some((a) => a === 'notify')) return 'muted';
  const room = rules?.global?.room?.find((r) => r.rule_id === roomId && r.enabled);
  if (room && !room.actions.some((a) => a === 'notify')) return 'mentions';
  return 'all';
}

/** Что записать, чтобы в силе было `alerts`: правила, которые убрать, и одно — завести. */
export function alertsRules(
  alerts: RoomAlerts,
  roomId: string,
): { remove: Array<{ kind: 'override' | 'room'; ruleId: string }>; add?: { kind: 'override' | 'room'; ruleId: string; body: Record<string, unknown> } } {
  const remove = [
    { kind: 'override' as const, ruleId: roomId },
    { kind: 'room' as const, ruleId: roomId },
  ];
  if (alerts === 'all') return { remove };
  if (alerts === 'mentions') return { remove, add: { kind: 'room', ruleId: roomId, body: { actions: [] } } };
  return {
    remove,
    add: { kind: 'override', ruleId: roomId, body: { actions: [], conditions: [{ kind: 'event_match', key: 'room_id', pattern: roomId }] } },
  };
}

/**
 * Уведомления всего аккаунта — до того, как у комнаты появилось своё мнение (как
 * `NotificationRulesStore` нативной Искры). Это push rules на сервере: они едут за аккаунтом
 * во все клиенты, а правило комнаты главнее умолчания.
 *
 * Умолчаний в Matrix четыре — личный или нет, зашифрованный или нет, — а человек отвечает на
 * два вопроса: личные чаты и группы. Читается зашифрованная половина пары (приватный чат в
 * Iskra зашифрован), пишутся обе — и правило опроса той же стороны, если оно есть.
 *
 * «Выключены» умолчанием не бывают: правило по умолчанию без `notify` — это и есть «только
 * упоминания», упоминания решает своё правило выше.
 */
export type DefaultAlerts = 'all' | 'mentions';

export type AccountSwitch = 'mentionsMe' | 'roomMentions' | 'invitations' | 'calls';

export interface AccountAlerts {
  direct: DefaultAlerts;
  groups: DefaultAlerts;
  mentionsMe: boolean;
  roomMentions: boolean;
  invitations: boolean;
  calls: boolean;
}

type RuleKind = 'override' | 'content' | 'underride';
type RuleRef = { kind: RuleKind; ruleId: string };

const defaultRules: Record<'direct' | 'groups', { read: RuleRef; write: RuleRef[] }> = {
  direct: {
    read: { kind: 'underride', ruleId: '.m.rule.encrypted_room_one_to_one' },
    write: [
      { kind: 'underride', ruleId: '.m.rule.encrypted_room_one_to_one' },
      { kind: 'underride', ruleId: '.m.rule.room_one_to_one' },
      { kind: 'underride', ruleId: '.m.rule.poll_start_one_to_one' },
    ],
  },
  groups: {
    read: { kind: 'underride', ruleId: '.m.rule.encrypted' },
    write: [
      { kind: 'underride', ruleId: '.m.rule.encrypted' },
      { kind: 'underride', ruleId: '.m.rule.message' },
      { kind: 'underride', ruleId: '.m.rule.poll_start' },
    ],
  },
};

/** Первое — то, что читается; остальные — устаревшие правила того же смысла, пишутся вместе. */
const switchRules: Record<AccountSwitch, RuleRef[]> = {
  mentionsMe: [
    { kind: 'override', ruleId: '.m.rule.is_user_mention' },
    { kind: 'override', ruleId: '.m.rule.contains_display_name' },
    { kind: 'content', ruleId: '.m.rule.contains_user_name' },
  ],
  roomMentions: [
    { kind: 'override', ruleId: '.m.rule.is_room_mention' },
    { kind: 'override', ruleId: '.m.rule.roomnotif' },
  ],
  invitations: [{ kind: 'override', ruleId: '.m.rule.invite_for_me' }],
  calls: [{ kind: 'underride', ruleId: '.m.rule.call' }],
};

function find(rules: IPushRules | undefined, ref: RuleRef) {
  return rules?.global?.[ref.kind]?.find((rule) => rule.rule_id === ref.ruleId);
}

const notifies = (rule: ReturnType<typeof find>) => !!rule?.enabled && rule.actions.some((a) => a === 'notify');

/** Что сейчас в силе. Правила нет — значит, сервер его не знает, и в силе «да», как у Matrix. */
export function accountAlerts(rules: IPushRules | undefined): AccountAlerts {
  const flag = (name: AccountSwitch) => {
    const rule = switchRules[name].map((ref) => find(rules, ref)).find((r) => r !== undefined);
    return rule ? notifies(rule) : true;
  };
  const byDefault = (side: 'direct' | 'groups'): DefaultAlerts => {
    const rule = find(rules, defaultRules[side].read) ?? find(rules, defaultRules[side].write[1]!);
    return !rule || notifies(rule) ? 'all' : 'mentions';
  };
  return {
    direct: byDefault('direct'),
    groups: byDefault('groups'),
    mentionsMe: flag('mentionsMe'),
    roomMentions: flag('roomMentions'),
    invitations: flag('invitations'),
    calls: flag('calls'),
  };
}

export type RuleWrite =
  | { kind: RuleKind; ruleId: string; actions: unknown[] }
  | { kind: RuleKind; ruleId: string; enabled: boolean };

/**
 * Что записать, чтобы умолчание стало `alerts`. Только правила, которые у сервера есть:
 * встроенное правило не заводят, а меняют. «Все» в личных — со звуком, как у Matrix из коробки.
 */
export function defaultAlertsWrites(rules: IPushRules | undefined, side: 'direct' | 'groups', alerts: DefaultAlerts): RuleWrite[] {
  const actions = alerts === 'mentions' ? [] : side === 'direct' ? ['notify', { set_tweak: 'sound', value: 'default' }] : ['notify'];
  return defaultRules[side].write.filter((ref) => find(rules, ref)).flatMap((ref) => {
    const writes: RuleWrite[] = [{ ...ref, actions }];
    // Выключенное правило «всех» не дало бы — включить.
    if (alerts === 'all' && !find(rules, ref)!.enabled) writes.push({ ...ref, enabled: true });
    return writes;
  });
}

/** Что записать, чтобы переключатель встал в `on`: правило включается или выключается целиком. */
export function switchWrites(rules: IPushRules | undefined, name: AccountSwitch, on: boolean): RuleWrite[] {
  return switchRules[name].filter((ref) => find(rules, ref)).map((ref) => ({ ...ref, enabled: on }));
}
