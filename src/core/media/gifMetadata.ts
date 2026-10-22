/**
 * GIF без метаданных — без перерисовки: канвас оставил бы один кадр из анимации. Как у WebP
 * (`webpMetadata.ts`), файл режется до того, из чего состоит картинка, — список разрешённого:
 * кадры с их управлением и палитрами, и единственное расширение приложения, без которого
 * анимация не повторяется (`NETSCAPE2.0`). Комментарии, XMP (`XMP DataXMP`) и всё, о чём ещё
 * никто не подумал, остаются позади.
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
  const kept: Array<[number, number]> = [];
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
    // 0xF9 — управление кадром (задержка, прозрачность), 0x01 — текст поверх кадра: картинка.
    // 0xFF — приложение: оставляем только счётчик повторов. 0xFE — комментарий: прочь.
    const application = label === 0xff && bytes[at + 2] === 11 ? String.fromCharCode(...bytes.subarray(at + 3, at + 14)) : '';
    if (label === 0xf9 || label === 0x01 || LOOP_APPLICATIONS.has(application)) kept.push([start, end]);
    at = end;
  }
  return undefined;
}

function join(bytes: Uint8Array, ranges: Array<[number, number]>): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(ranges.reduce((sum, [from, to]) => sum + to - from, 0));
  let at = 0;
  for (const [from, to] of ranges) {
    out.set(bytes.subarray(from, to), at);
    at += to - from;
  }
  return out;
}
