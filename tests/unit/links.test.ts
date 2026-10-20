import { describe, expect, it } from 'vitest';
import { linkTarget, shareLink } from '../../src/core/navigation/links';

describe('ссылки на людей и комнаты', () => {
  it('пишем свои — s.iskra.wtf', () => {
    expect(shareLink('@alice:matrix.org')).toBe('https://s.iskra.wtf/@alice:matrix.org');
    expect(shareLink('#iskra:matrix.org')).toBe('https://s.iskra.wtf/%23iskra:matrix.org');
    expect(shareLink('!abc:matrix.org', ['matrix.org', 'example.com:8448'])).toBe(
      'https://s.iskra.wtf/!abc:matrix.org?via=matrix.org&via=example.com%3A8448',
    );
  });

  it('свои читаем обратно', () => {
    for (const [id, via] of [
      ['@alice:matrix.org', []],
      ['#iskra:matrix.org', []],
      ['!abc:localhost:8448', ['localhost:8448']],
    ] as const) {
      const expected = via.length ? { target: id, via } : { target: id };
      expect(linkTarget(shareLink(id, [...via]))).toEqual(expected);
    }
  });

  it('s.iskra.wtf — путь, %23 и хеш', () => {
    expect(linkTarget('https://s.iskra.wtf/%40alice%3Amatrix.org')).toEqual({ target: '@alice:matrix.org' });
    // Некодированный `#` браузер отрезал в хеш: `s.iskra.wtf/#iskra:matrix.org`.
    expect(linkTarget('https://s.iskra.wtf/#iskra:matrix.org')).toEqual({ target: '#iskra:matrix.org' });
    expect(linkTarget('https://s.iskra.wtf/#/@alice:matrix.org')).toEqual({ target: '@alice:matrix.org' });
    expect(linkTarget('https://s.iskra.wtf/#/!abc:m.org?via=m.org')).toEqual({ target: '!abc:m.org', via: ['m.org'] });
  });

  it('matrix.to — как раньше, и ссылка на событие ведёт в комнату', () => {
    expect(linkTarget('https://matrix.to/#/@alice:matrix.org')).toEqual({ target: '@alice:matrix.org' });
    expect(linkTarget('https://matrix.to/#/%23iskra%3Amatrix.org')).toEqual({ target: '#iskra:matrix.org' });
    expect(linkTarget('https://matrix.to/#/!abc:m.org/$event?via=m.org')).toEqual({ target: '!abc:m.org', via: ['m.org'] });
  });

  it('остальное — не наше', () => {
    for (const href of [
      'https://example.com/@alice:matrix.org',
      'http://s.iskra.wtf/@alice:matrix.org',
      'https://matrix.to/#alice:matrix.org',
      'https://s.iskra.wtf/',
      'https://s.iskra.wtf/about',
      'https://s.iskra.wtf/%E0%A4%A',
      'не ссылка',
    ]) {
      expect(linkTarget(href), href).toBeUndefined();
    }
  });
});
