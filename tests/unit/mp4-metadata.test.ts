import { describe, expect, it } from 'vitest';
import { stripMp4Metadata } from '../../src/core/media/mp4Metadata';

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type: string, ...parts: number[][]): number[] => {
  const body = parts.flat();
  return [...u32(8 + body.length), ...ascii(type), ...body];
};
/** FullBox версии 0: флаги нулевые. */
const full = (type: string, ...parts: number[][]) => box(type, [0, 0, 0, 0], ...parts);
const times = [...u32(3_000_000_000), ...u32(3_000_000_001)];
const hdlr = (handler: string) => full('hdlr', u32(0), ascii(handler), u32(0), u32(0), u32(0), [0]);

/** ftyp, moov (с udta, meta, видеодорожкой и дорожкой координат), mdat — координаты в нём. */
function movie(): { bytes: Uint8Array; secret: string } {
  const secret = '+55.7558+037.6173/';
  const ftyp = box('ftyp', ascii('isom'), u32(0), ascii('isom'));
  const video = box('trak', full('tkhd', times, u32(1)), box('mdia', full('mdhd', times), hdlr('vide')), box('udta', box('©nam', ascii('Clip'))));
  // Дорожка координат: один образец в mdat. Смещение — после ftyp и moov, впишем ниже.
  const stbl = (offset: number) =>
    box('stbl', full('stsz', u32(0), u32(1), u32(secret.length)), full('stsc', u32(1), u32(1), u32(1), u32(1)), full('stco', u32(1), u32(offset)));
  const located = (offset: number) => box('trak', full('tkhd', times, u32(2)), box('mdia', full('mdhd', times), hdlr('meta'), box('minf', stbl(offset))));
  const moovOf = (offset: number) =>
    box('moov', full('mvhd', times, u32(600)), box('udta', box('©xyz', ascii(secret))), full('meta', hdlr('mdta'), box('keys', ascii('com.apple.quicktime.location.ISO6709'))), video, located(offset));
  const sizeBefore = ftyp.length + moovOf(0).length;
  const mdat = box('mdat', ascii('FRAMES'), ascii(secret));
  // Образец координат — после заголовка mdat и «кадров».
  const bytes = new Uint8Array([...ftyp, ...moovOf(sizeBefore + 8 + 6), ...mdat]);
  return { bytes, secret };
}

const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe('видео без метаданных', () => {
  it('геопозиция, ключи iPhone и дорожка координат — стёрты; кадры и размер — те же', () => {
    const { bytes, secret } = movie();
    expect(text(bytes)).toContain(secret);
    const out = stripMp4Metadata(bytes)!;
    expect(out).not.toBeNull();
    expect(out.length).toBe(bytes.length);
    const after = text(out);
    expect(after).not.toContain(secret);
    expect(after).not.toContain('com.apple.quicktime.location');
    expect(after).not.toContain('Clip');
    expect(after).not.toContain('meta');
    // Картинка на месте: видеодорожка и её данные.
    expect(after).toContain('vide');
    expect(after).toContain('FRAMES');
    // Время съёмки — нули.
    expect(after).not.toContain(String.fromCharCode(...u32(3_000_000_000)));
    // Исходник не тронут.
    expect(text(bytes)).toContain(secret);
  });

  it('не MP4 — не разбираем, решает вызывающий', () => {
    expect(stripMp4Metadata(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]))).toBeNull();
    expect(stripMp4Metadata(new Uint8Array(box('ftyp', ascii('isom'))))).toBeNull();
  });
});
