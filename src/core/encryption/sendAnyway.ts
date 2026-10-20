/**
 * «Отправить всё равно» — `withdrawVerificationAndResend` и `ignoreDeviceTrustAndResend`
 * нативной. Не повтор, а решение о доверии, и принимает его читающий, никогда не мы:
 *
 * - сменилась личность у проверенного — проверка, которая больше не держится, снимается
 *   (`withdrawVerificationRequirement`): человек становится просто знакомым, как все
 *   непроверенные;
 * - у проверенного устройство, которое он сам не подписал, — этому устройству доверяем как
 *   есть (`LocalTrust.Ignored` в Rust-крипто), отныне.
 *
 * Сколько людей и устройств, крипто не говорит — в ошибке только текст. Поэтому обходим
 * тех, кому шифруем, и ищем то же, что ищет оно.
 */
import type { MatrixClient, Room } from 'matrix-js-sdk';

/** Снять проверку с тех, у кого после неё сменилась личность. */
export async function withdrawChangedVerifications(client: MatrixClient, room: Room): Promise<void> {
  const crypto = client.getCrypto();
  if (!crypto) return;
  for (const member of await room.getEncryptionTargetMembers()) {
    const status = await crypto.getUserVerificationStatus(member.userId);
    if (status.needsUserApproval && status.wasCrossSigningVerified()) await crypto.withdrawVerificationRequirement(member.userId);
  }
}

/**
 * Довериться устройствам проверенных, которые их владельцы не подписали.
 *
 * `setDeviceVerified` здесь не годится: «проверено вручную» строгий режим не принимает за
 * подпись владельца, и сообщение снова не уйдёт. Принимает он только «доверять как есть»
 * (`LocalTrust.Ignored`), а его `CryptoApi` не открывает — поэтому через olm-машину. Ни
 * одного класса из WASM напрямую: `UserId` и `DeviceId` — те же конструкторы, что у её
 * собственных `userId` и `deviceId`, иначе второй экземпляр модуля их бы не узнал.
 */
export async function trustUnsignedDevices(client: MatrixClient, room: Room): Promise<boolean> {
  const crypto = client.getCrypto();
  const machine = (crypto as unknown as { olmMachine?: OlmMachine } | undefined)?.olmMachine;
  if (!crypto || !machine) return false;
  const UserId = machine.userId.constructor as new (id: string) => unknown;
  const DeviceId = machine.deviceId.constructor as new (id: string) => unknown;
  for (const member of await room.getEncryptionTargetMembers()) {
    const status = await crypto.getUserVerificationStatus(member.userId);
    if (!status.isCrossSigningVerified()) continue;
    const devices = (await crypto.getUserDeviceInfo([member.userId])).get(member.userId) ?? new Map();
    for (const deviceId of devices.keys()) {
      const trust = await crypto.getDeviceVerificationStatus(member.userId, deviceId);
      if (trust?.signedByOwner) continue;
      const device = await machine.getDevice(new UserId(member.userId), new DeviceId(deviceId));
      await device?.setLocalTrust(LOCAL_TRUST_IGNORED);
    }
  }
  return true;
}

/** `LocalTrust.Ignored` из matrix-sdk-crypto-wasm. */
const LOCAL_TRUST_IGNORED = 2;

interface OlmMachine {
  readonly userId: object;
  readonly deviceId: object;
  getDevice(userId: unknown, deviceId: unknown): Promise<{ setLocalTrust(trust: number): Promise<unknown> } | undefined>;
}
