/**
 * Файл с устройства → `OutgoingFile`: тип, размеры, длительность и миниатюра считаются
 * здесь, до отправки, — чтобы у получателя место под картинку было отведено до того, как
 * она загрузилась, а в ленте было что показать, пока оригинал в пути.
 *
 * Ничего не отправляет: путь наверх один — `core/media/upload.ts`.
 */
import type { OutgoingFile, OutgoingKind } from '../../core/media/upload';
import { photoPlan, renamed, type MediaSendSettings, type PhotoPlan } from './mediaSettings';
import { stripMp4Metadata } from '../../core/media/mp4Metadata';
import { isWebP, stripWebPMetadata } from '../../core/media/webpMetadata';
import { stripGifMetadata } from '../../core/media/gifMetadata';
import { compressVideo } from './videoCompress';
import { t } from '../../i18n/index.svelte.ts';

/** Длинная сторона миниатюры, px. */
const THUMBNAIL_SIDE = 800;
/** Меньше этого миниатюра не нужна: оригинал и есть превью. */
const THUMBNAIL_WORTH_BYTES = 200 * 1024;
const METADATA_TIMEOUT_MS = 5000;

/**
 * Что это для Matrix. SVG — не `m.image`: многие клиенты его не покажут, а некоторые
 * покажут с сюрпризом; уходит файлом.
 */
export function kindOf(type: string): OutgoingKind {
  if (/^image\/(jpeg|png|gif|webp|avif|bmp)$/.test(type)) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

/**
 * «Без метаданных» включено, а снять их не вышло: такой файл не отправляется — как в нативной
 * (`MediaPreparation.photo` → `nil`), никогда не «уйдёт оригиналом». Фото с геопозицией,
 * ушедшее потому, что браузер не смог его перерисовать, — то, от чего настройка и обещает беречь.
 */
export class MetadataNotRemovedError extends Error {
  constructor(readonly fileName: string) {
    super('metadata could not be removed');
    this.name = 'MetadataNotRemovedError';
  }
}

/** Что настройки велят чистить: фото (GIF — без перерисовки, `gifMetadata.ts`) и MP4/MOV. */
function mustStrip(mimetype: string, kind: OutgoingKind, settings: MediaSendSettings): boolean {
  if (!settings.stripMetadata) return false;
  return kind === 'image' || /^video\/(mp4|quicktime)$/.test(mimetype);
}

export async function prepareFile(file: File, settings: MediaSendSettings): Promise<OutgoingFile> {
  const mimetype = file.type || 'application/octet-stream';
  const kind = kindOf(mimetype);
  let base: OutgoingFile = { blob: file, name: file.name || nameFor(mimetype), mimetype, kind };
  const strip = mustStrip(mimetype, kind, settings);
  // GIF чистится до всего, по байтам: что бы ни случилось дальше с размерами, он уже чист.
  if (strip && mimetype === 'image/gif') {
    const stripped = stripGifMetadata(new Uint8Array(await file.arrayBuffer()));
    if (!stripped) throw new MetadataNotRemovedError(base.name);
    base = { ...base, blob: new Blob([stripped], { type: 'image/gif' }) };
  }
  try {
    // WebP — это стикер, как у Telegram: без пузыря, своим размером, с прозрачностью (`StickerPicture` нативной).
    if (mimetype === 'image/webp') {
      const sticker = await stickerFile(file, t('preview.sticker'));
      if (sticker) return sticker;
    }
    if (kind === 'image') return await image(base, settings);
    if (kind === 'video') {
      const clean = await videoWithoutMetadata(base, settings);
      const ready: OutgoingFile = { ...clean, ...(await videoInfo(file).catch(() => ({}))) };
      return settings.compress ? { ...ready, prepare: (signal, onProgress) => compressed(ready, settings, signal, onProgress) } : ready;
    }
    if (kind === 'audio') return { ...base, ...(await audioInfo(file)) };
  } catch (error) {
    if (error instanceof MetadataNotRemovedError) throw error;
    // Фото не разобрали — значит, и не перерисовали: метаданные на месте.
    if (strip && kind === 'image' && mimetype !== 'image/gif') throw new MetadataNotRemovedError(base.name);
    // Не разобрали — отправим без размеров: получатель просто не узнает их заранее.
  }
  return base;
}

/**
 * Картинка, которая уходит стикером. Настройки сжатия не при чём — стикер и так мал, а
 * сжатый в JPEG стикер — стикер на чёрном квадрате. Метаданные — всегда долой: WebP режется
 * до чанков картинки (анимация и прозрачность целы), остальное перерисовывается в PNG.
 * `null` — не вышло ни то ни другое: такой не отправляется.
 */
export async function stickerFile(blob: Blob, body: string): Promise<OutgoingFile | null> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let out: Blob | undefined;
    let mimetype = 'image/png';
    if (isWebP(bytes)) {
      const stripped = stripWebPMetadata(bytes);
      if (stripped) {
        out = new Blob([stripped], { type: 'image/webp' });
        mimetype = 'image/webp';
      }
    }
    const decoded = await decodeImage(out ?? blob);
    try {
      out ??= (await draw(decoded.source, decoded.width, decoded.height, 'image/png', 1)) ?? undefined;
      if (!out) return null;
      const ext = mimetype === 'image/webp' ? 'webp' : 'png';
      return { blob: out, name: `sticker.${ext}`, mimetype, kind: 'image', width: decoded.width, height: decoded.height, sticker: { body } };
    } finally {
      decoded.release();
    }
  } catch {
    return null;
  }
}

/** Вставка из буфера приходит без имени: «image.png» — лучше, чем ничего. */
function nameFor(type: string): string {
  const ext = type.split('/')[1]?.split('+')[0] ?? 'bin';
  return `${type.split('/')[0] ?? 'file'}.${ext}`;
}

/**
 * Фото: перекодировать, если так велят настройки (метаданные, сжатие), и посчитать
 * размеры и миниатюру. GIF не перекодируется — это убило бы анимацию: метаданные из него
 * вырезаются по байтам.
 */
async function image(base: OutgoingFile, settings: MediaSendSettings): Promise<OutgoingFile> {
  const decoded = await decodeImage(base.blob);
  try {
    const { width, height } = decoded;
    let out: OutgoingFile = { ...base, width, height };
    const plan = base.mimetype === 'image/gif' ? null : photoPlan(base.mimetype, width, height, settings);
    if (plan) {
      const drawn = await drawWithin(decoded.source, plan);
      // Без метаданных — только перекодированным. Сжатие, которое сделало файл больше, — не сжатие.
      if (drawn && (settings.stripMetadata || drawn.blob.size < base.blob.size)) {
        const type = drawn.blob.type;
        out = { ...out, blob: drawn.blob, mimetype: type, name: renamed(base.name, type), width: drawn.width, height: drawn.height };
      } else if (settings.stripMetadata) {
        throw new MetadataNotRemovedError(base.name);
      }
    }
    if (out.mimetype !== 'image/gif' && (out.blob.size > THUMBNAIL_WORTH_BYTES || Math.max(out.width!, out.height!) > THUMBNAIL_SIDE * 2)) {
      const thumbnail = await drawThumbnail(decoded.source, width, height);
      if (thumbnail) out.thumbnail = thumbnail;
    }
    return out;
  } finally {
    decoded.release();
  }
}

/**
 * Холст больше, чем браузер согласен нарисовать, — пустой ответ, а не ошибка: Safari на iPhone
 * не даёт больше ~16 Мп, и снимок в 48 Мп не перерисовывается в свой размер. Тогда — ещё раз,
 * вписав в этот предел. Тип — какой браузер дал на самом деле: Safari пишет PNG вместо WebP,
 * и это тоже чистые пиксели.
 */
const CANVAS_PIXELS = 16_000_000;

async function drawWithin(source: CanvasImageSource, plan: PhotoPlan): Promise<{ blob: Blob; width: number; height: number } | null> {
  const attempt = async (width: number, height: number) => {
    const blob = await draw(source, width, height, plan.mimetype, plan.quality);
    return blob && /^image\/(jpeg|png|webp)$/.test(blob.type) ? { blob, width, height } : null;
  };
  const full = await attempt(plan.width, plan.height);
  if (full || plan.width * plan.height <= CANVAS_PIXELS) return full;
  const scale = Math.sqrt(CANVAS_PIXELS / (plan.width * plan.height));
  return attempt(Math.max(1, Math.floor(plan.width * scale)), Math.max(1, Math.floor(plan.height * scale)));
}

function draw(source: CanvasImageSource, width: number, height: number, type: string, quality: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** `createImageBitmap`, а где он не справился (старый Safari) — `<img>`. */
async function decodeImage(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // Поворот из EXIF — в пиксели: метаданные со стиранием уходят, а фото не должно лечь набок.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // ниже — запасной путь
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

async function drawThumbnail(source: CanvasImageSource, width: number, height: number): Promise<OutgoingFile['thumbnail']> {
  const scale = Math.min(1, THUMBNAIL_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const blob = await draw(source, w, h, 'image/jpeg', 0.8);
  return blob ? { blob, width: w, height: h, mimetype: 'image/jpeg' } : undefined;
}

/**
 * Видео без метаданных, если так велят настройки: MP4 и MOV правятся на месте, без
 * перекодирования (`mp4Metadata.ts`). Не разобрали — не уходит (`MetadataNotRemovedError`).
 * Другой контейнер (WebM — запись экрана браузером) уходит как есть: метаданных о человеке
 * в нём нет, а разбирать его нечем.
 */
async function videoWithoutMetadata(base: OutgoingFile, settings: MediaSendSettings): Promise<OutgoingFile> {
  if (!settings.stripMetadata || !/^video\/(mp4|quicktime)$/.test(base.mimetype)) return base;
  const stripped = stripMp4Metadata(new Uint8Array(await base.blob.arrayBuffer()));
  if (!stripped) throw new MetadataNotRemovedError(base.name);
  return { ...base, blob: new Blob([stripped], { type: base.mimetype }) };
}

/**
 * Сжатое видео — уже при отправке (`OutgoingFile.prepare`). Из того, что лоток показывал: без
 * метаданных, если так велят настройки, — значит, и не сжавшись, уходит без них. Миниатюра и
 * длительность — прежние: кадр тот же, только меньше.
 */
async function compressed(ready: OutgoingFile, settings: MediaSendSettings, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<OutgoingFile> {
  const result = await compressVideo(ready.blob, settings.compression, settings.stripMetadata, signal, onProgress);
  if (!result) return ready;
  if (settings.stripMetadata) {
    // Мультиплексор пишет своё (программа, время) — то, что уходит, перечитывается так же, как
    // несжатое. Не вышло — уходит несжатое: оно уже очищено.
    const clean = stripMp4Metadata(new Uint8Array(await result.blob.arrayBuffer()));
    if (!clean) return ready;
    result.blob = new Blob([clean], { type: 'video/mp4' });
  }
  const name = `${ready.name.replace(/\.[^./]+$/, '') || 'video'}.mp4`;
  return { ...ready, blob: result.blob, mimetype: 'video/mp4', name, width: result.width, height: result.height };
}

/** Размеры, длительность и кадр для миниатюры — у `<video>` без звука и без показа. */
async function videoInfo(file: File): Promise<Partial<OutgoingFile>> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await once(video, 'loadedmetadata');
    const info: Partial<OutgoingFile> = {
      width: video.videoWidth,
      height: video.videoHeight,
      ...(Number.isFinite(video.duration) ? { duration: video.duration * 1000 } : {}),
    };
    // Первый кадр бывает чёрным — берём чуть дальше начала.
    video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
    await once(video, 'seeked');
    const thumbnail = await drawThumbnail(video, video.videoWidth, video.videoHeight);
    if (thumbnail) info.thumbnail = thumbnail;
    return info;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function audioInfo(file: File): Promise<Partial<OutgoingFile>> {
  const url = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src = url;
  try {
    await once(audio, 'loadedmetadata');
    return Number.isFinite(audio.duration) ? { duration: audio.duration * 1000 } : {};
  } finally {
    URL.revokeObjectURL(url);
  }
}

function once(element: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), METADATA_TIMEOUT_MS);
    element.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true });
    element.addEventListener('error', () => (clearTimeout(timer), reject(new Error('media error'))), { once: true });
  });
}
