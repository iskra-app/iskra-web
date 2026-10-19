/**
 * Файл с устройства → `OutgoingFile`: тип, размеры, длительность и миниатюра считаются
 * здесь, до отправки, — чтобы у получателя место под картинку было отведено до того, как
 * она загрузилась, а в ленте было что показать, пока оригинал в пути.
 *
 * Ничего не отправляет: путь наверх один — `core/media/upload.ts`.
 */
import type { OutgoingFile, OutgoingKind } from '../../core/media/upload';
import { photoPlan, renamed, type MediaSendSettings } from './mediaSettings';

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

export async function prepareFile(file: File, settings: MediaSendSettings): Promise<OutgoingFile> {
  const mimetype = file.type || 'application/octet-stream';
  const kind = kindOf(mimetype);
  const base: OutgoingFile = { blob: file, name: file.name || nameFor(mimetype), mimetype, kind };
  try {
    if (kind === 'image') return await image(base, settings);
    if (kind === 'video') return { ...base, ...(await videoInfo(file)) };
    if (kind === 'audio') return { ...base, ...(await audioInfo(file)) };
  } catch {
    // Не разобрали — отправим без размеров: получатель просто не узнает их заранее.
  }
  return base;
}

/** Вставка из буфера приходит без имени: «image.png» — лучше, чем ничего. */
function nameFor(type: string): string {
  const ext = type.split('/')[1]?.split('+')[0] ?? 'bin';
  return `${type.split('/')[0] ?? 'file'}.${ext}`;
}

/**
 * Фото: перекодировать, если так велят настройки (метаданные, сжатие), и посчитать
 * размеры и миниатюру. GIF не трогается — перекодирование убило бы анимацию.
 */
async function image(base: OutgoingFile, settings: MediaSendSettings): Promise<OutgoingFile> {
  const decoded = await decodeImage(base.blob);
  try {
    const { width, height } = decoded;
    let out: OutgoingFile = { ...base, width, height };
    const plan = base.mimetype === 'image/gif' ? null : photoPlan(base.mimetype, width, height, settings);
    if (plan) {
      const blob = await draw(decoded.source, plan.width, plan.height, plan.mimetype, plan.quality);
      // Без метаданных — только перекодированным. Сжатие, которое сделало файл больше, — не сжатие.
      if (blob && blob.type === plan.mimetype && (settings.stripMetadata || blob.size < base.blob.size)) {
        out = { ...out, blob, mimetype: plan.mimetype, name: renamed(base.name, plan.mimetype), width: plan.width, height: plan.height };
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
