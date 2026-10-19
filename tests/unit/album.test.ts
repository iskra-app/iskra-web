import { describe, expect, it } from 'vitest';
import { ALBUM_LIMIT, foldAlbums } from '../../src/core/timeline/album';
import { layout } from '../../src/core/timeline/layout';
import type { Message } from '../../src/core/timeline/message';
import { bottom, mosaic, splits } from '../../src/design/albumMosaic';

const T = Date.UTC(2026, 9, 18, 12);

function photo(key: string, seconds: number, extra: Partial<Message> = {}, caption?: string): Message {
  return {
    key,
    eventId: `$${key}`,
    kind: { type: 'image', attachment: { name: `${key}.jpg`, width: 1200, height: 800, ...(caption ? { caption } : {}) } },
    senderId: '@a:x',
    senderName: 'А',
    own: false,
    ts: T + seconds * 1000,
    delivery: { state: 'sent' },
    edited: false,
    reactions: [],
    pinned: false,
    canEdit: false,
    canDelete: true,
    ...extra,
  };
}

const text = (key: string, seconds: number): Message => ({ ...photo(key, seconds), kind: { type: 'text', body: '…' } });
const shape = (rows: Message[]) => rows.map((m) => (m.album ? m.album.map((a) => a.key).join('+') : m.key));

describe('альбом', () => {
  it('фото одного человека подряд, в секундах друг от друга, — одна строка с ключом первого', () => {
    expect(shape(foldAlbums([photo('a', 0), photo('b', 4), photo('c', 8)]))).toEqual(['a+b+c']);
    const rows = layout([photo('a', 0), photo('b', 4)]).filter((i) => i.kind === 'message');
    expect(rows.map((i) => i.key)).toEqual(['a']);
  });

  it('пауза меряется между соседями, а не от первого', () => {
    expect(shape(foldAlbums([photo('a', 0), photo('b', 14), photo('c', 28)]))).toEqual(['a+b+c']);
    expect(shape(foldAlbums([photo('a', 0), photo('b', 16)]))).toEqual(['a', 'b']);
  });

  it('рвут: слово между, другой человек, ответ, подпись дальше первого, пересланное, предел', () => {
    expect(shape(foldAlbums([photo('a', 0), text('t', 1), photo('b', 2)]))).toEqual(['a', 't', 'b']);
    expect(shape(foldAlbums([photo('a', 0), photo('b', 1, { senderId: '@b:x' })]))).toEqual(['a', 'b']);
    expect(shape(foldAlbums([photo('a', 0), photo('b', 1, { replyTo: { eventId: '$x' } })]))).toEqual(['a', 'b']);
    // Подпись у первого — подпись альбома; у второго — начало следующего.
    expect(shape(foldAlbums([photo('a', 0, {}, 'двор'), photo('b', 1)]))).toEqual(['a+b']);
    expect(shape(foldAlbums([photo('a', 0), photo('b', 1, {}, 'лес')]))).toEqual(['a', 'b']);
    expect(shape(foldAlbums([photo('a', 0), photo('b', 1, { forwarded: {} })]))).toEqual(['a', 'b']);
    const many = Array.from({ length: ALBUM_LIMIT + 1 }, (_, i) => photo(`p${i}`, i));
    expect(foldAlbums(many).map((m) => m.album?.length ?? 1)).toEqual([ALBUM_LIMIT, 1]);
  });

  it('полоса «непрочитанные» рвёт альбом: новое не прячется в старом пузыре', () => {
    const rows = layout([photo('a', 0), photo('b', 4, { senderId: '@a:x' })], 'b').filter((i) => i.kind !== 'day');
    expect(rows.map((i) => i.key)).toEqual(['a', 'unread-divider', 'b']);
  });

  it('доставка — как у самой отстающей; удалить — если можно каждую', () => {
    const [album] = foldAlbums([
      photo('a', 0, { own: true }),
      photo('b', 1, { own: true, delivery: { state: 'failed', reason: 'server' } }),
      photo('c', 2, { own: true, delivery: { state: 'sending' }, canDelete: false }),
    ]);
    expect(album!.delivery.state).toBe('failed');
    expect(album!.canDelete).toBe(false);
  });
});

describe('мозаика альбома', () => {
  it('все разбиения на строки до четырёх', () => {
    expect(splits(3)).toEqual([[1, 1, 1], [1, 2], [2, 1], [3]]);
    expect(splits(5).every((s) => s.every((n) => n >= 1 && n <= 4))).toBe(true);
  });

  it('рамки — во всю ширину, без наложений, не выше потолка', () => {
    for (const ratios of [[1.5, 1.5], [0.6, 1.5, 1.5], [1, 0.8, 1.5, 1, 1.2, 0.7], [3, 0.2, 1]]) {
      const frames = mosaic(ratios, 0.01, 1.25);
      expect(frames).toHaveLength(ratios.length);
      expect(bottom(frames)).toBeLessThanOrEqual(1.25 + 1e-9);
      for (const f of frames) {
        expect(f.x).toBeGreaterThanOrEqual(-1e-9);
        expect(f.x + f.width).toBeLessThanOrEqual(1 + 1e-9);
        expect(f.width).toBeGreaterThan(0);
        expect(f.height).toBeGreaterThan(0);
      }
      const overlap = (a: (typeof frames)[0], b: (typeof frames)[0]) =>
        a.x < b.x + b.width - 1e-9 && b.x < a.x + a.width - 1e-9 && a.y < b.y + b.height - 1e-9 && b.y < a.y + a.height - 1e-9;
      frames.forEach((a, i) => frames.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)));
    }
  });

  it('высокое первое фото среди трёх — своим столбцом слева', () => {
    const frames = mosaic([0.6, 1.5, 1.5], 0.01, 1.25);
    expect(frames[0]).toMatchObject({ x: 0, y: 0 });
    expect(frames[1]!.x).toBeGreaterThan(0);
    expect(frames[2]!.x).toBeCloseTo(frames[1]!.x);
  });

  it('одно — во всю ширину по своей форме', () => {
    expect(mosaic([2], 0.01, 1.25)).toEqual([{ x: 0, y: 0, width: 1, height: 0.5 }]);
  });
});
