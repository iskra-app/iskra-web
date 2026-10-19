/**
 * Уведомления всего аккаунта — `NotificationRulesStore` нативной Искры. Правила на сервере,
 * поэтому едут во все клиенты аккаунта; правило комнаты главнее умолчания (см. `pushRules.ts`).
 *
 * Переключатель двигается сразу и возвращается, если сервер отказал: палец уже на нём, и
 * вернувшийся переключатель говорит о сбое яснее, чем не сдвинувшийся. Текст сбоя называет,
 * какой это был, — к моменту чтения он уже на месте и выглядит нетронутым.
 */
import { ClientEvent, EventType, type MatrixClient, type MatrixEvent, type PushRuleAction, type PushRuleKind } from 'matrix-js-sdk';
import { accountAlerts, defaultAlertsWrites, switchWrites, type AccountAlerts, type AccountSwitch, type DefaultAlerts, type RuleWrite } from '../rooms/pushRules';

/** Ключи текстов нативной Искры (`notificationRules.*Failed`). */
export type NotificationRulesFailure = 'directFailed' | 'groupFailed' | 'mentionFailed' | 'roomMentionFailed' | 'invitationFailed' | 'callFailed';

const switchFailure: Record<AccountSwitch, NotificationRulesFailure> = {
  mentionsMe: 'mentionFailed',
  roomMentions: 'roomMentionFailed',
  invitations: 'invitationFailed',
  calls: 'callFailed',
};

export class NotificationRules {
  /** `null` — сервер правил не прислал: ряд переключателей «всё включено» был бы враньём. */
  current = $state<AccountAlerts | null>(null);
  failure = $state<NotificationRulesFailure | null>(null);
  /** Сервер не ответил на чтение — отдельно от «ещё не прочитано», и только с этим что-то сделаешь. */
  loadFailed = $state(false);

  private readonly client: MatrixClient;
  private readonly off: () => void;
  /** Записи в полёте: пока они не вернулись, пришедшие синхронизацией правила — старые. */
  private writing = 0;

  constructor(client: MatrixClient) {
    this.client = client;
    const onAccountData = (event: MatrixEvent) => {
      if (event.getType() === EventType.PushRules && this.writing === 0) this.read();
    };
    client.on(ClientEvent.AccountData, onAccountData);
    this.off = () => client.off(ClientEvent.AccountData, onAccountData);
    this.read();
  }

  /** Перечитать с сервера — при каждом открытии настроек: так видно изменённое в другом клиенте. */
  async load(): Promise<void> {
    try {
      await this.client.getPushRules();
      this.loadFailed = false;
    } catch {
      this.loadFailed = !this.current;
    }
    if (this.writing === 0) this.read();
  }

  async setDefault(side: 'direct' | 'groups', alerts: DefaultAlerts): Promise<void> {
    if (!this.current || this.current[side] === alerts) return;
    await this.change({ [side]: alerts }, defaultAlertsWrites(this.client.pushRules, side, alerts), side === 'direct' ? 'directFailed' : 'groupFailed');
  }

  async setSwitch(name: AccountSwitch, on: boolean): Promise<void> {
    if (!this.current || this.current[name] === on) return;
    await this.change({ [name]: on }, switchWrites(this.client.pushRules, name, on), switchFailure[name]);
  }

  dismissFailure(): void {
    this.failure = null;
  }

  destroy(): void {
    this.off();
  }

  private async change(next: Partial<AccountAlerts>, writes: RuleWrite[], failure: NotificationRulesFailure): Promise<void> {
    if (!this.current) return;
    this.failure = null;
    this.current = { ...this.current, ...next };
    this.writing++;
    try {
      for (const write of writes) {
        const kind = write.kind as PushRuleKind;
        if ('actions' in write) await this.client.setPushRuleActions('global', kind, write.ruleId, write.actions as PushRuleAction[]);
        else await this.client.setPushRuleEnabled('global', kind, write.ruleId, write.enabled);
      }
    } catch {
      this.failure = failure;
    } finally {
      this.writing--;
    }
    // Перечитать с сервера (`getPushRules` сам кладёт их в клиент): после сбоя — тем более.
    if (this.writing === 0) {
      await this.client.getPushRules().catch(() => {});
      this.read();
    }
  }

  private read(): void {
    const rules = this.client.pushRules;
    this.current = rules?.global ? accountAlerts(rules) : null;
  }
}
