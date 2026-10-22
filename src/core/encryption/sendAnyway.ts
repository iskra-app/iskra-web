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
 * тех, кому шифруем, и ищем то же, что ищет оно (`unsignedDevices`). Человек видит этот список
 * до того, как согласится, и доверие получают ровно те, кого он видел: устройство, появившееся
 * между вопросом и ответом, его не получит.
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

/** Устройство, которое его владелец — проверенный собеседник — сам не подписал. */
export interface UnsignedDevice {
  userId: string;
  /** Имя владельца в этой комнате. */
  owner: string;
  deviceId: string;
  /** Как владелец назвал устройство; может не быть. */
  name?: string;
}

/** Устройства проверенных собеседников комнаты, не подписанные их владельцами. */
export async function unsignedDevices(client: MatrixClient, room: Room): Promise<UnsignedDevice[]> {
  const crypto = client.getCrypto();
  if (!crypto) return [];
  const found: UnsignedDevice[] = [];
  for (const member of await room.getEncryptionTargetMembers()) {
    const status = await crypto.getUserVerificationStatus(member.userId);
    if (!status.isCrossSigningVerified()) continue;
    const devices = (await crypto.getUserDeviceInfo([member.userId])).get(member.userId) ?? new Map();
    for (const [deviceId, device] of devices) {
      const trust = await crypto.getDeviceVerificationStatus(member.userId, deviceId);
      if (trust?.signedByOwner) continue;
      found.push({ userId: member.userId, owner: member.name || member.userId, deviceId, ...(device.displayName ? { name: device.displayName } : {}) });
    }
  }
  return found;
}

/**
 * Довериться этим устройствам — и только им.
 *
 * `setDeviceVerified` здесь не годится: «проверено вручную» строгий режим не принимает за
 * подпись владельца, и сообщение снова не уйдёт. Принимает он только «доверять как есть»
 * (`LocalTrust.Ignored`), а его `CryptoApi` не открывает — поэтому через olm-машину. Ни
 * одного класса из WASM напрямую: `UserId` и `DeviceId` — те же конструкторы, что у её
 * собственных `userId` и `deviceId`, иначе второй экземпляр модуля их бы не узнал.
 */
export async function trustUnsignedDevices(client: MatrixClient, devices: UnsignedDevice[]): Promise<boolean> {
  const crypto = client.getCrypto();
  const machine = (crypto as unknown as { olmMachine?: OlmMachine } | undefined)?.olmMachine;
  if (!crypto || !machine) return false;
  const UserId = machine.userId.constructor as new (id: string) => unknown;
  const DeviceId = machine.deviceId.constructor as new (id: string) => unknown;
  for (const { userId, deviceId } of devices) {
    const device = await machine.getDevice(new UserId(userId), new DeviceId(deviceId));
    await device?.setLocalTrust(LOCAL_TRUST_IGNORED);
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
