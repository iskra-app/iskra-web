import { describe, expect, it } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { trustUnsignedDevices } from '../../src/core/encryption/sendAnyway';

class Id {
  constructor(readonly value: string) {}
}

describe('«Отправить всё равно»', () => {
  it('доверие получают ровно те устройства, что человек видел в подтверждении', async () => {
    const trusted: string[] = [];
    const machine = {
      userId: new Id('@me:example.org'),
      deviceId: new Id('MINE'),
      getDevice: async (user: Id, device: Id) => ({
        setLocalTrust: async () => void trusted.push(`${user.value}/${device.value}`),
      }),
    };
    const client = { getCrypto: () => ({ olmMachine: machine }) } as unknown as MatrixClient;
    await trustUnsignedDevices(client, [{ userId: '@bob:example.org', owner: 'Bob', deviceId: 'SEEN' }]);
    expect(trusted).toEqual(['@bob:example.org/SEEN']);
  });
});
