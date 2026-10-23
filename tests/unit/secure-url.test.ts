import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverServer } from '../../src/core/auth/server';
import { secureUrl } from '../../src/core/support/secureUrl';

describe('адрес от сервера', () => {
  it('https — да; http — только свой компьютер; javascript:, data:, имя в адресе — нет', () => {
    expect(secureUrl('https://account.example.org/reset')?.href).toBe('https://account.example.org/reset');
    expect(secureUrl('http://localhost:8008/')).not.toBeNull();
    expect(secureUrl('http://example.org/')).toBeNull();
    expect(secureUrl('javascript:alert(1)')).toBeNull();
    expect(secureUrl('data:text/html,<b>x</b>')).toBeNull();
    expect(secureUrl('https://user:pass@example.org/')).toBeNull();
    expect(secureUrl('не адрес')).toBeNull();
    expect(secureUrl(undefined)).toBeNull();
  });
});

describe('OAuth с адресами не по https не предлагается', () => {
  afterEach(() => vi.unstubAllGlobals());

  const server = (authorizationEndpoint: string) =>
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (url.includes('/.well-known/matrix/client')) return json({}, 404);
      if (url.includes('/versions')) return json({ versions: ['v1.15'] });
      if (url.includes('auth_metadata')) {
        return json({
          issuer: 'https://auth.example.org/',
          authorization_endpoint: authorizationEndpoint,
          token_endpoint: 'https://auth.example.org/token',
          registration_endpoint: 'https://auth.example.org/register',
          revocation_endpoint: 'https://auth.example.org/revoke',
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          response_modes_supported: ['query', 'fragment'],
          code_challenge_methods_supported: ['S256'],
        });
      }
      if (url.includes('/login')) return json({ flows: [{ type: 'm.login.password' }] });
      return json({ errcode: 'M_UNRECOGNIZED' }, 404);
    });

  it('страница входа по https — путь есть', async () => {
    vi.stubGlobal('fetch', server('https://auth.example.org/authorize'));
    expect((await discoverServer('example.org')).oauth).toBeDefined();
  });

  it('страница входа по http или javascript: — только пароль', async () => {
    for (const endpoint of ['http://auth.example.org/authorize', 'javascript:alert(1)']) {
      vi.stubGlobal('fetch', server(endpoint));
      const info = await discoverServer('example.org');
      expect(info.oauth).toBeUndefined();
      expect(info.password).toBe(true);
    }
  });
});
