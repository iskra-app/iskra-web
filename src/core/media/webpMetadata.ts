/**
 * WebP без метаданных — `StickerPicture.pictureOnly` нативной Искры. Перекодировать WebP через
 * канвас умеет не каждый браузер (Safari — нет), и прозрачность с анимацией при этом теряются.
 * Поэтому контейнер режется до чанков, из которых состоит картинка: список разрешённых, а не
 * запрещённых — `EXIF`, `XMP ` и всё, о чём ещё никто не подумал, остаются позади.
 *
 * `undefined` — файл не годный RIFF: такой не отправляется как есть.
 */
const PICTURE_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);
/** Флаги VP8X: 0x08 — EXIF, 0x04 — XMP. Их больше нет. */
const VP8X_METADATA_FLAGS = 0x0c;

export function isWebP(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && ascii(bytes, 0) === 'RIFF' && ascii(bytes, 8) === 'WEBP';
}

export function stripWebPMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> | undefined {
  if (!isWebP(bytes)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [];
  let total = 0;
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return undefined;
    const name = ascii(bytes, offset);
    const length = view.getUint32(offset + 4, true);
    if (offset + 8 + length > bytes.length) return undefined;
    const padded = length + (length & 1);
    if (PICTURE_CHUNKS.has(name)) {
      const chunk = new Uint8Array(8 + padded);
      chunk.set(bytes.subarray(offset, Math.min(offset + 8 + padded, bytes.length)));
      if (name === 'VP8X' && length >= 1) chunk[8] = chunk[8]! & ~VP8X_METADATA_FLAGS;
      kept.push(chunk);
      total += chunk.length;
    }
    offset += 8 + padded;
  }
  const out = new Uint8Array(12 + total);
  out.set(bytes.subarray(0, 4));
  new DataView(out.buffer).setUint32(4, 4 + total, true);
  out.set(bytes.subarray(8, 12), 8);
  let at = 12;
  for (const chunk of kept) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function ascii(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}
