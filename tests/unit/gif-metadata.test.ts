import { describe, expect, it } from 'vitest';
import { stripGifMetadata } from '../../src/core/media/gifMetadata';

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

/** Два кадра 1×1, повтор, комментарий и XMP — то, что остаётся, и то, что уходит. */
function animation(): Uint8Array {
  const header = [...ascii('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255];
  const loop = [0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), 3, 1, 0, 0, 0];
  const comment = [0x21, 0xfe, 9, ...ascii('Camera X1'), 0];
  const xmp = [0x21, 0xff, 11, ...ascii('XMP DataXMP'), 12, ...ascii('GPS=55.7558;'), 0];
  const frame = [0x21, 0xf9, 4, 0, 10, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x4c, 0x01, 0];
  return new Uint8Array([...header, ...loop, ...comment, ...xmp, ...frame, ...frame, 0x3b]);
}

describe('GIF без метаданных', () => {
  it('комментарий и XMP — прочь; кадры, их задержки и повтор — на месте', () => {
    const out = stripGifMetadata(animation())!;
    expect(out).toBeDefined();
    expect(text(out)).not.toContain('Camera X1');
    expect(text(out)).not.toContain('GPS=');
    expect(text(out)).not.toContain('XMP');
    expect(text(out)).toContain('NETSCAPE2.0');
    expect(out.filter((b) => b === 0x2c).length).toBeGreaterThanOrEqual(2);
    expect(out.at(-1)).toBe(0x3b);
  });

  it('не GIF или оборванный — не разбираем', () => {
    expect(stripGifMetadata(new Uint8Array(ascii('PNG')))).toBeUndefined();
    expect(stripGifMetadata(animation().subarray(0, 40))).toBeUndefined();
  });
  it('в разрешённых блоках не унести: лишний подблок у повтора и у управления кадром — прочь', () => {
    const header = [...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0];
    const loop = [0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), 3, 1, 0, 0, 8, ...ascii('LAT=55.7'), 0];
    const control = [0x21, 0xf9, 4, 0, 10, 0, 0, 6, ...ascii('SECRET'), 0];
    const frame = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x4c, 0x01, 0];
    const overlay = [0x21, 0x01, 12, ...new Array(12).fill(0), 5, ...ascii('HELLO'), 0];
    const out = stripGifMetadata(new Uint8Array([...header, ...loop, ...control, ...overlay, ...frame, 0x3b]))!;
    expect(text(out)).not.toContain('LAT=');
    expect(text(out)).not.toContain('SECRET');
    expect(text(out)).not.toContain('HELLO');
    expect(text(out)).toContain('NETSCAPE2.0');
  });
});
