/**
 * Кто в этой комнате сменил ключи — `IdentityChangesStore` нативной.
 *
 * Без этого веб молчал: по умолчанию SDK шифрует для новой личности без единого слова, и
 * сообщение уходит тому, у кого теперь эти ключи. Это нормально, когда человек просто сменил
 * телефон, — и это вся атака, когда нет. Отличить может только читающий, поэтому вопрос
 * задаётся ему, по одному человеку за раз.
 *
 * Сигнал — от самого крипто: `needsUserApproval` у `getUserVerificationStatus` и событие
 * `UserTrustStatusChanged`, когда оно меняется. «Понятно» — не проверка: новые ключи
 * запоминаются как ожидаемые (`pinCurrentUserIdentity`), а для проверенного раньше —
 * снимается проверка, которая больше не держится (`withdrawVerificationRequirement`).
 * Именно это не даёт полосе вернуться.
 */
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api/CryptoEvent';
import type { UserVerificationStatus } from 'matrix-js-sdk/lib/crypto-api';
import { ClientEvent, RoomStateEvent, type MatrixClient, type MatrixEvent, type RoomMember } from 'matrix-js-sdk';

export interface IdentityChange {
  userId: string;
  name: string;
  /**
   * `changed` — новые ключи у того, кого не проверяли: новый телефон, переустановка, потерянный
   * код — и ровно так же выглядит сервер, вставший посередине. `afterVerification` — новые
   * ключи у проверенного: то, что проверяли, больше не держится.
   */
  kind: 'changed' | 'afterVerification';
}

export class IdentityChangesStore {
  /** В порядке, в каком узнали, — первым старший. Никогда не свой аккаунт. */
  changes = $state<IdentityChange[]>([]);

  private readonly detach: Array<() => void> = [];
  private stopped = false;

  constructor(
    private readonly client: MatrixClient,
    private readonly roomId: string,
  ) {
    const target = client as unknown as {
      on(e: string, h: (...args: never[]) => void): void;
      off(e: string, h: (...args: never[]) => void): void;
    };
    const onTrust = (userId: string, status: UserVerificationStatus) => {
      if (this.isMember(userId)) this.apply(userId, status);
    };
    const onMember = (_event: MatrixEvent, _state: unknown, member: RoomMember) => {
      if (member.roomId === this.roomId) void this.check(member.userId);
    };
    // Чат открыт из адреса при запуске — комнаты ещё нет, или участники пришли раньше, чем
    // `m.room.encryption`. Тогда первая проверка пуста, и спросить надо ещё раз, когда синхронизация
    // её принесёт: смена ключей, оставшаяся без ответа, сама по себе событием не повторится.
    const onSync = () => {
      if (!this.members().length) return;
      target.off(ClientEvent.Sync, onSync);
      void this.checkAll();
    };
    target.on(CryptoEvent.UserTrustStatusChanged, onTrust);
    target.on(RoomStateEvent.Members, onMember);
    target.on(ClientEvent.Sync, onSync);
    this.detach.push(
      () => target.off(CryptoEvent.UserTrustStatusChanged, onTrust),
      () => target.off(RoomStateEvent.Members, onMember),
      () => target.off(ClientEvent.Sync, onSync),
    );
    if (this.members().length) void this.checkAll();
  }

  destroy(): void {
    this.stopped = true;
    for (const off of this.detach.splice(0)) off();
  }

  /**
   * «Понятно» или «Снять отметку о проверке». Не получилось — бросает: полоса, которая будто
   * ушла, а при следующем запуске вернулась, хуже той, что осталась и сказала почему.
   */
  async acknowledge(change: IdentityChange): Promise<void> {
    const crypto = this.client.getCrypto();
    if (!crypto) throw new Error('no crypto');
    if (change.kind === 'afterVerification') await crypto.withdrawVerificationRequirement(change.userId);
    else await crypto.pinCurrentUserIdentity(change.userId);
    // Крипто скажет об этом и само, но полоса должна уйти по нажатию, а не синхронизацией позже.
    this.changes = this.changes.filter((c) => c.userId !== change.userId);
  }

  private members(): RoomMember[] {
    const room = this.client.getRoom(this.roomId);
    if (!room?.hasEncryptionStateEvent()) return [];
    const own = this.client.getUserId();
    return room.getMembers().filter((m) => m.userId !== own && (m.membership === 'join' || m.membership === 'invite'));
  }

  private isMember(userId: string): boolean {
    return this.members().some((m) => m.userId === userId);
  }

  private async checkAll(): Promise<void> {
    for (const member of this.members()) await this.check(member.userId);
  }

  private async check(userId: string): Promise<void> {
    const crypto = this.client.getCrypto();
    if (!crypto || !this.isMember(userId)) return;
    try {
      const status = await crypto.getUserVerificationStatus(userId);
      if (!this.stopped) this.apply(userId, status);
    } catch {
      // Крипто не ответило — значит, и сказать нечего.
    }
  }

  private apply(userId: string, status: UserVerificationStatus): void {
    if (this.stopped || userId === this.client.getUserId()) return;
    const kind = !status.needsUserApproval ? null : status.wasCrossSigningVerified() ? 'afterVerification' : 'changed';
    if (!kind) {
      if (this.changes.some((c) => c.userId === userId)) this.changes = this.changes.filter((c) => c.userId !== userId);
      return;
    }
    const name = this.client.getRoom(this.roomId)?.getMember(userId)?.name ?? userId;
    const change: IdentityChange = { userId, name, kind };
    const index = this.changes.findIndex((c) => c.userId === userId);
    this.changes = index < 0 ? [...this.changes, change] : this.changes.map((c, i) => (i === index ? change : c));
  }
}
