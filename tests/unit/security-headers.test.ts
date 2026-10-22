import { describe, expect, it } from 'vitest';
import { headersFile, nginxHeaders, securityHeaders } from '../../security-headers';

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

  it('nginx несёт ту же политику и все заголовки', () => {
    const nginx = nginxHeaders();
    expect(nginx).toContain(`add_header Content-Security-Policy "${csp}" always;\n`);
    for (const name of Object.keys(securityHeaders(false))) expect(nginx).toContain(`add_header ${name} "`);
    // Двойная кавычка закрыла бы строку nginx раньше времени, `$` он прочёл бы как переменную.
    for (const value of Object.values(securityHeaders(false))) expect(value).not.toMatch(/["$]/);
  });
});

describe('второй эшелон', () => {
  const headers = securityHeaders(false);

  it('чужие страницы не встраивают наши файлы; окно не делится собой', () => {
    expect(headers['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
  });

  it('из возможностей браузера — только камера, микрофон и геопозиция, и только себе', () => {
    const policy = headers['Permissions-Policy']!;
    for (const own of ['camera', 'microphone', 'geolocation']) expect(policy).toContain(`${own}=(self)`);
    for (const none of ['clipboard-read', 'usb', 'bluetooth', 'payment', 'display-capture']) expect(policy).toContain(`${none}=()`);
  });
});
