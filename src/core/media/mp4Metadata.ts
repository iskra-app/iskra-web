/**
 * Видео без метаданных — без перекодирования (`MetadataStripper.video` нативной: «только
 * картинка и звук»).
 *
 * MP4 и MOV — дерево боксов. Где что сказано о снимающем:
 * - `moov/udta` — Android пишет туда геопозицию (`©xyz`), камеры — модель и прочее;
 * - `moov/meta` — iPhone: ключи `com.apple.quicktime.location.ISO6709`, модель, программа;
 * - `udta` и `meta` у дорожек; XMP — бокс `uuid` с известным ID;
 * - время съёмки — в `mvhd`, `tkhd`, `mdhd`;
 * - дорожки не видео и не звука (`hdlr` не `vide`/`soun`) — например, временные метаданные с
 *   координатами, кадр за кадром.
 *
 * Перекодировать нечем без новой зависимости (WebCodecs и мультиплексор), поэтому файл
 * правится на месте: бокс метаданных становится `free` того же размера, и его содержимое
 * обнуляется; у лишней дорожки обнуляются и её данные в `mdat`. Размеры не меняются — значит,
 * не сдвигается ни одно смещение на кадры, и плеер видит тот же фильм.
 */

const FREE = [0x66, 0x72, 0x65, 0x65]; // 'free'
/** XMP в ISO BMFF: `uuid` be7acfcb-97a9-42e8-9c71-999491e3afac. */
const XMP_UUID = 'be7acfcb97a942e89c71999491e3afac';

interface Box {
  type: string;
  /** Начало бокса (заголовка). */
  start: number;
  /** Начало содержимого. */
  body: number;
  end: number;
}

function boxes(view: DataView, from: number, to: number): Box[] | null {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    const type = String.fromCharCode(view.getUint8(at + 4), view.getUint8(at + 5), view.getUint8(at + 6), view.getUint8(at + 7));
    let body = at + 8;
    if (size === 1) {
      if (at + 16 > to) return null;
      const big = view.getBigUint64(at + 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(big);
      body = at + 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < body - at || at + size > to) return null;
    out.push({ type, start: at, body, end: at + size });
    at += size;
  }
  return at === to ? out : null;
}

/** Бокс → `free` того же размера, содержимое — нули. */
function blank(bytes: Uint8Array, box: Box): void {
  bytes.set(FREE, box.start + 4);
  bytes.fill(0, box.body, box.end);
}

/** Время создания и изменения в `mvhd`/`tkhd`/`mdhd` — нули. Версия 1 — восьмибайтовые. */
function clearTimes(bytes: Uint8Array, view: DataView, box: Box): void {
  if (box.end - box.body < 4) return;
  const version = view.getUint8(box.body);
  const width = version === 1 ? 8 : 4;
  const times = box.body + 4;
  if (times + 2 * width <= box.end) bytes.fill(0, times, times + 2 * width);
}

const child = (view: DataView, box: Box, type: string): Box | undefined => boxes(view, box.body, box.end)?.find((b) => b.type === type);

function handlerOf(view: DataView, trak: Box): string | undefined {
  const mdia = child(view, trak, 'mdia');
  const hdlr = mdia && child(view, mdia, 'hdlr');
  // FullBox: версия и флаги (4), pre_defined (4), handler_type (4).
  if (!hdlr || hdlr.body + 12 > hdlr.end) return undefined;
  const at = hdlr.body + 8;
  return String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
}

/** Где в файле лежат образцы дорожки: [начало, конец) по `stsz`, `stsc`, `stco`/`co64`. */
function sampleRanges(view: DataView, trak: Box): Array<[number, number]> | null {
  const mdia = child(view, trak, 'mdia');
  const minf = mdia && child(view, mdia, 'minf');
  const stbl = minf && child(view, minf, 'stbl');
  if (!stbl) return [];
  const stsz = child(view, stbl, 'stsz');
  const stsc = child(view, stbl, 'stsc');
  const stco = child(view, stbl, 'stco') ?? child(view, stbl, 'co64');
  if (!stsz || !stsc || !stco) return [];
  const fixed = view.getUint32(stsz.body + 4);
  const count = view.getUint32(stsz.body + 8);
  const sizeOf = (i: number) => (fixed !== 0 ? fixed : view.getUint32(stsz.body + 12 + i * 4));
  const chunks = view.getUint32(stco.body + 4);
  const wide = stco.type === 'co64';
  const offsetOf = (c: number) => (wide ? Number(view.getBigUint64(stco.body + 8 + c * 8)) : view.getUint32(stco.body + 8 + c * 4));
  const entries = view.getUint32(stsc.body + 4);
  const ranges: Array<[number, number]> = [];
  let sample = 0;
  for (let e = 0; e < entries; e++) {
    const first = view.getUint32(stsc.body + 8 + e * 12) - 1;
    const perChunk = view.getUint32(stsc.body + 8 + e * 12 + 4);
    const last = e + 1 < entries ? view.getUint32(stsc.body + 8 + (e + 1) * 12) - 1 : chunks;
    for (let c = first; c < last && c < chunks; c++) {
      let at = offsetOf(c);
      for (let s = 0; s < perChunk && sample < count; s++, sample++) {
        const size = sizeOf(sample);
        ranges.push([at, at + size]);
        at += size;
      }
    }
  }
  return ranges;
}

/**
 * Копия файла без метаданных — или `null`, если это не ISO BMFF, который удалось разобрать
 * (тогда решает вызывающий). Исходные байты не трогаются.
 */
export function stripMp4Metadata(source: Uint8Array): Uint8Array<ArrayBuffer> | null {
  const bytes = source.slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    const top = boxes(view, 0, bytes.length);
    if (!top || top[0]?.type !== 'ftyp') return null;
    const moov = top.find((b) => b.type === 'moov');
    if (!moov) return null;
    for (const box of top) {
      if (box.type === 'meta' || box.type === 'udta') blank(bytes, box);
      if (box.type === 'uuid' && box.body + 16 <= box.end && hex(bytes, box.body, 16) === XMP_UUID) blank(bytes, box);
    }
    const inMoov = boxes(view, moov.body, moov.end);
    if (!inMoov) return null;
    for (const box of inMoov) {
      if (box.type === 'udta' || box.type === 'meta' || box.type === 'uuid') blank(bytes, box);
      else if (box.type === 'mvhd') clearTimes(bytes, view, box);
      else if (box.type === 'trak') {
        const handler = handlerOf(view, box);
        if (handler !== 'vide' && handler !== 'soun') {
          // Не картинка и не звук: и описание, и сами данные в `mdat` — прочь.
          const ranges = sampleRanges(view, box);
          if (!ranges) return null;
          for (const [from, to] of ranges) if (from >= 0 && to <= bytes.length && from < to) bytes.fill(0, from, to);
          blank(bytes, box);
          continue;
        }
        const inTrak = boxes(view, box.body, box.end) ?? [];
        for (const part of inTrak) {
          if (part.type === 'udta' || part.type === 'meta') blank(bytes, part);
          else if (part.type === 'tkhd') clearTimes(bytes, view, part);
          else if (part.type === 'mdia') {
            const mdhd = child(view, part, 'mdhd');
            if (mdhd) clearTimes(bytes, view, mdhd);
          }
        }
      }
    }
    return bytes;
  } catch {
    return null;
  }
}

function hex(bytes: Uint8Array, from: number, length: number): string {
  return Array.from(bytes.subarray(from, from + length), (b) => b.toString(16).padStart(2, '0')).join('');
}
