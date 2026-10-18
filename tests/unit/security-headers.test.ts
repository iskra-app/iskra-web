import { describe, expect, it } from 'vitest';
import { caddyHeaders, headersFile, securityHeaders } from '../../security-headers';

describe('CSP — главная граница', () => {
  const csp = securityHeaders(false)['Content-Security-Policy']!;
  const directive = (name: string) =>
    csp.split('; ').find((d) => d.startsWith(`${name} `))?.slice(name.length + 1).split(' ') ?? [];

  it('никаких unsafe-inline и unsafe-eval в сборке', () => {
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('скрипты — только свои и WASM', () => {
    expect(directive('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
  });

  it('картинки — свои, blob: и data:, и никаких чужих хостов', () => {
    expect(directive('img-src')).toEqual(["'self'", 'blob:', 'data:']);
  });

  it('в рамку не вставить', () => {
    expect(directive('frame-ancestors')).toEqual(["'none'"]);
  });

  it('Trusted Types включены', () => {
    expect(directive('require-trusted-types-for')).toEqual(["'script'"]);
  });

  it('_headers несёт ту же политику', () => {
    expect(headersFile()).toContain(`Content-Security-Policy: ${csp}`);
  });

  it('Caddy несёт ту же политику и все заголовки', () => {
    const caddy = caddyHeaders();
    expect(caddy).toContain(`\tContent-Security-Policy "${csp}"\n`);
    for (const name of Object.keys(securityHeaders(false))) expect(caddy).toContain(`\t${name} "`);
    // Двойная кавычка внутри значения закрыла бы строку Caddy раньше времени.
    for (const value of Object.values(securityHeaders(false))) expect(value).not.toContain('"');
  });
});
