/**
 * GIF без метаданных — без перерисовки: канвас оставил бы один кадр из анимации. Как у WebP
 * (`webpMetadata.ts`), файл режется до того, из чего состоит картинка, — список разрешённого:
 * кадры с палитрами и их управление (задержка, прозрачность) — только ровно своего размера, и
 * счётчик повторов (`NETSCAPE2.0`) — собранный заново из двух его байт: в подблоках
 * разрешённого расширения можно унести что угодно, поэтому они не копируются как есть.
 * Комментарии, XMP (`XMP DataXMP`), текст поверх кадра и всё, о чём ещё никто не подумал,
 * остаются позади.
 *
 * `undefined` — не GIF или не разобрался: такой с включённой очисткой не отправляется.
 */
const LOOP_APPLICATIONS = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0']);

export function isGif(bytes: Uint8Array): boolean {
  const head = String.fromCharCode(...bytes.subarray(0, 6));
  return head === 'GIF87a' || head === 'GIF89a';
}

export function stripGifMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> | undefined {
  if (!isGif(bytes) || bytes.length < 13) return undefined;
  const kept: Array<[number, number] | Uint8Array> = [];
  const colorTable = (flags: number) => (flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0);
  /** Конец цепочки подблоков, начинающейся в `at`, — после нулевого. */
  const subBlocks = (at: number): number | undefined => {
    while (at < bytes.length) {
      const size = bytes[at]!;
      at += 1 + size;
      if (size === 0) return at;
    }
    return undefined;
  };

  let at = 13 + colorTable(bytes[10]!);
  kept.push([0, at]);
  while (at < bytes.length) {
    const start = at;
    const introducer = bytes[at];
    if (introducer === 0x3b) {
      kept.push([at, at + 1]);
      return join(bytes, kept);
    }
    if (introducer === 0x2c) {
      if (at + 10 > bytes.length) return undefined;
      at += 10 + colorTable(bytes[at + 9]!) + 1; // дескриптор, палитра, минимальный код LZW
      const end = subBlocks(at);
      if (end === undefined) return undefined;
      kept.push([start, end]);
      at = end;
      continue;
    }
    if (introducer !== 0x21 || at + 2 > bytes.length) return undefined;
    const label = bytes[at + 1];
    const end = subBlocks(at + 2);
    if (end === undefined) return undefined;
    // 0xF9 — управление кадром: один подблок ровно в 4 байта и конец, иначе в нём что-то лишнее.
    if (label === 0xf9 && end === at + 8 && bytes[at + 2] === 4) kept.push([start, end]);
    // 0xFF — приложение: из повтора берём два байта счётчика, остальное — прочь.
    const application = label === 0xff && bytes[at + 2] === 11 ? String.fromCharCode(...bytes.subarray(at + 3, at + 14)) : '';
    if (LOOP_APPLICATIONS.has(application) && bytes[at + 14] === 3 && bytes[at + 15] === 1) {
      kept.push(new Uint8Array([0x21, 0xff, 11, ...Array.from('NETSCAPE2.0', (c) => c.charCodeAt(0)), 3, 1, bytes[at + 16]!, bytes[at + 17]!, 0]));
    }
    at = end;
  }
  return undefined;
}

function join(bytes: Uint8Array, parts: Array<[number, number] | Uint8Array>): Uint8Array<ArrayBuffer> {
  const pieces = parts.map((part) => (part instanceof Uint8Array ? part : bytes.subarray(part[0], part[1])));
  const out = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
  let at = 0;
  for (const piece of pieces) {
    out.set(piece, at);
    at += piece.length;
  }
  return out;
}
