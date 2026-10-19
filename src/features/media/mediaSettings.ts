/**
 * Фото и видео — `MediaSettings` нативной Искры: что происходит с фото по пути наружу и что
 * само приходит в ленту. Настройки этого устройства (`preferences`), читаются в момент
 * отправки и показа — «Готово» нет, следующее фото уже уходит по-новому.
 *
 * Сжимаются здесь только фото: перекодировать видео браузер умеет лишь через WebCodecs и
 * мультиплексор — новая зависимость ради одного переключателя. Видео уходит как есть.
 */

/** Три ступени, как в нативной: пара чисел, которые имеют смысл только вместе. */
export const compressions = ['strong', 'balanced', 'light'] as const;
export type MediaCompression = (typeof compressions)[number];

/** Длинная сторона фото, px, и качество JPEG — числа нативной (`maxPhotoSide`, `photoQuality`). */
export const photoCompression: Record<MediaCompression, { side: number; quality: number }> = {
  strong: { side: 1280, quality: 0.6 },
  balanced: { side: 2048, quality: 0.75 },
  light: { side: 4096, quality: 0.85 },
};

/** Без сжатия, но без метаданных — перекодировать почти без потерь, в исходном размере. */
const UNCOMPRESSED_QUALITY = 0.92;

/** Когда фото и видео в ленте загружаются сами — три ответа Telegram, как в нативной. */
export const autoDownloads = ['always', 'wifi', 'never'] as const;
export type MediaAutoDownload = (typeof autoDownloads)[number];

export interface MediaSendSettings {
  stripMetadata: boolean;
  compress: boolean;
  compression: MediaCompression;
}

export interface PhotoPlan {
  width: number;
  height: number;
  mimetype: 'image/jpeg' | 'image/png' | 'image/webp';
  quality: number;
}

/**
 * Как перекодировать фото — или `null`, если трогать его незачем.
 *
 * Метаданные (EXIF, а в нём геопозиция) уходят только перекодированием: канвас пишет одни
 * пиксели. Поворот из EXIF при этом не теряется — браузер применяет его, декодируя.
 * PNG остаётся PNG (прозрачность, без потерь), WebP — WebP; остальное — JPEG.
 */
export function photoPlan(type: string, width: number, height: number, settings: MediaSendSettings): PhotoPlan | null {
  if (!settings.stripMetadata && !settings.compress) return null;
  const limit = settings.compress ? photoCompression[settings.compression].side : Infinity;
  const scale = Math.min(1, limit / Math.max(width, height));
  if (!settings.stripMetadata && scale === 1 && type !== 'image/bmp') return null;
  const quality = settings.compress ? photoCompression[settings.compression].quality : UNCOMPRESSED_QUALITY;
  const mimetype = type === 'image/png' ? 'image/png' : type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), mimetype, quality };
}

/** Новое имя под новый тип: «IMG_1.HEIC» → «IMG_1.jpg». */
export function renamed(name: string, mimetype: string): string {
  const ext = mimetype === 'image/png' ? 'png' : mimetype === 'image/webp' ? 'webp' : 'jpg';
  const base = name.replace(/\.[^./]+$/, '');
  return `${base || 'image'}.${ext}`;
}

/**
 * Дорогая ли сеть. Знает только Chromium (`navigator.connection`): мобильная сеть или
 * «экономия трафика». Где браузер не говорит — считаем, что нет: молча не показывать фото
 * хуже, чем показать.
 */
export function onExpensiveNetwork(): boolean {
  const connection = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  return !!connection && (connection.saveData === true || connection.type === 'cellular');
}

export function allowsAutoDownload(choice: MediaAutoDownload, expensive = onExpensiveNetwork()): boolean {
  return choice === 'always' || (choice === 'wifi' && !expensive);
}
