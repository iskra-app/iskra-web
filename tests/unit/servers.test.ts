import { describe, expect, it } from 'vitest';
import { isRussianLocale, publicServers } from '../../src/features/signin/servers';

describe('выбор сервера', () => {
  it('предупреждает о matrix.org только тех, у кого в браузере что-то русское', () => {
    expect(isRussianLocale(['ru-RU'])).toBe(true);
    expect(isRussianLocale(['en-US', 'ru'])).toBe(true);
    expect(isRussianLocale(['en-RU'])).toBe(true);
    expect(isRussianLocale(['en-US', 'de-DE'])).toBe(false);
    // «ru» внутри другого подтега — не Россия.
    expect(isRussianLocale(['sr-Cyrl-RS'])).toBe(false);

    expect(publicServers(['ru-RU'])[0]).toMatchObject({ address: 'matrix.org', warning: 'servers.matrixOrgBlocked' });
    expect(publicServers(['en-GB'])[0]).not.toHaveProperty('warning');
  });

  it('те же серверы и в том же порядке, что в нативной Искре', () => {
    expect(publicServers([]).map((s) => s.address)).toEqual(['matrix.org', 'tchncs.de', 'quassel.io', 'nope.chat']);
  });
});
