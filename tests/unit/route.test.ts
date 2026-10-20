import { describe, expect, it } from 'vitest';
import { formatRoute, isOpenTarget, isRoomId, parseRoute, type Route } from '../../src/core/navigation/route';

describe('адрес', () => {
  it('чат туда и обратно', () => {
    const route = { name: 'room', roomId: '!abc:matrix.org' } as const;
    expect(formatRoute(route)).toBe('#/room/!abc%3Amatrix.org');
    expect(parseRoute(formatRoute(route))).toEqual(route);
    expect(parseRoute('#/room/!abc:matrix.org')).toEqual(route);
  });

  it('всё незнакомое — домой, а не ошибка', () => {
    for (const hash of ['', '#', '#/', '#/room/', '#/room/not-a-room', '#/room/%E0%A4%A', '#/settings/nope', '#/room/!a:b/extra', '#/open/', '#/open/alice', '#/open/%40alice', '#/open/%E0%A4%A', '#/open/@a:b/extra', '#/open/%40a%20b%3Ac']) {
      expect(parseRoute(hash), hash).toEqual({ name: 'home' });
    }
  });

  it('настройки — с разделом и без', () => {
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/settings/storage')).toEqual({ name: 'settings', section: 'storage' });
    expect(formatRoute({ name: 'settings', section: 'security' })).toBe('#/settings/security');
    // Устройства и заблокированные переехали в «Безопасность» — старые ссылки ведут туда.
    expect(parseRoute('#/settings/blocked')).toEqual({ name: 'settings', section: 'security' });
  });

  it('ID комнаты — и ничего больше', () => {
    expect(isRoomId('!abc:matrix.org')).toBe(true);
    expect(isRoomId('!abc:localhost:8448')).toBe(true);
    expect(isRoomId('#alias:matrix.org')).toBe(false);
    expect(isRoomId('!abc matrix.org')).toBe(false);
    expect(isRoomId('!abc')).toBe(false);
  });

  it('чужая ссылка — человек, адрес или комната', () => {
    expect(parseRoute('#/open/%40alice%3Amatrix.org')).toEqual({ name: 'open', target: '@alice:matrix.org' });
    expect(parseRoute('#/open/@alice:matrix.org')).toEqual({ name: 'open', target: '@alice:matrix.org' });
    expect(parseRoute('#/open/%23iskra%3Amatrix.org')).toEqual({ name: 'open', target: '#iskra:matrix.org' });
    expect(parseRoute('#/open/!abc%3Amatrix.org?via=matrix.org&via=example.com:8448')).toEqual({
      name: 'open',
      target: '!abc:matrix.org',
      via: ['matrix.org', 'example.com:8448'],
    });
    // Негодный `via` отбрасывается, ссылка остаётся.
    expect(parseRoute('#/open/!abc%3Amatrix.org?via=a/b&other=1')).toEqual({ name: 'open', target: '!abc:matrix.org' });
  });

  it('чужая ссылка туда и обратно', () => {
    const routes: Route[] = [
      { name: 'open', target: '@alice:matrix.org' },
      { name: 'open', target: '#iskra:matrix.org' },
      { name: 'open', target: '!abc:localhost:8448', via: ['localhost:8448', 'matrix.org'] },
    ];
    for (const route of routes) {
      expect(parseRoute(formatRoute(route))).toEqual(route);
    }
    expect(formatRoute({ name: 'open', target: '#iskra:matrix.org' })).toBe('#/open/%23iskra%3Amatrix.org');
  });

  it('что открывает ссылка', () => {
    expect(isOpenTarget('@alice:matrix.org')).toBe(true);
    expect(isOpenTarget('#iskra:matrix.org')).toBe(true);
    expect(isOpenTarget('!abc:localhost:8448')).toBe(true);
    expect(isOpenTarget('+group:matrix.org')).toBe(false);
    expect(isOpenTarget('@alice')).toBe(false);
    expect(isOpenTarget('@ali ce:matrix.org')).toBe(false);
  });
});
