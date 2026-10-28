/**
 * Фото и видео — `MediaSettings` нативной Искры: что происходит с фото по пути наружу и что
 * само приходит в ленту. Настройки этого устройства (`preferences`), читаются в момент
 * отправки и показа — «Готово» нет, следующее фото уже уходит по-новому.
 *
 * Видео сжимается WebCodecs самого браузера (H.264 + AAC в mp4, Mediabunny — `videoCompress.ts`),
 * в момент отправки: минута видео пережимается десятки секунд, и лоток всё это время не ждёт.
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

/**
 * Видео — числа нативной (`MediaCompression.videoBox`, `videoBitRate`, `audioBitRate`,
 * `maxFrameRate`): кадр вписывается в рамку длинной и короткой стороной, битрейт — не выше
 * исходного, шестьдесят кадров — только на лёгкой ступени.
 */
export const videoCompression: Record<MediaCompression, { long: number; short: number; bitrate: number; audioBitrate: number; frameRate: number }> = {
  strong: { long: 960, short: 540, bitrate: 1_200_000, audioBitrate: 64_000, frameRate: 30 },
  balanced: { long: 1280, short: 720, bitrate: 2_500_000, audioBitrate: 96_000, frameRate: 30 },
  light: { long: 1920, short: 1080, bitrate: 5_000_000, audioBitrate: 128_000, frameRate: 60 },
};

/** Что известно об исходном видео до перекодирования. */
export interface VideoSource {
  /** Как показывается — с учётом поворота. */
  width: number;
  height: number;
  /** бит/с; неизвестен — `undefined`. */
  bitrate?: number | undefined;
  frameRate?: number | undefined;
}

export interface VideoPlan {
  width: number;
  height: number;
  bitrate: number;
  audioBitrate: number;
  /** Не задан — частота исходника. */
  frameRate?: number;
}

/** Запас, в котором исходник считается «уже таким»: перекодировать ради пары процентов — только терять качество. */
const VIDEO_SLACK = 1.1;

/**
 * Как пережать видео — или `null`, если выигрывать нечего: кадр уже в рамке, битрейт и частота
 * не выше ступени. Стороны — чётные: H.264 с 4:2:0 нечётных не берёт.
 */
export function videoPlan(source: VideoSource, compression: MediaCompression): VideoPlan | null {
  const step = videoCompression[compression];
  const long = Math.max(source.width, source.height);
  const short = Math.min(source.width, source.height);
  const scale = Math.min(1, step.long / long, step.short / short);
  const even = (side: number) => Math.max(2, Math.round((side * scale) / 2) * 2);
  const bitrate = source.bitrate ? Math.min(step.bitrate, source.bitrate) : step.bitrate;
  const fast = (source.frameRate ?? 0) > step.frameRate * VIDEO_SLACK;
  const heavy = !source.bitrate || source.bitrate > step.bitrate * VIDEO_SLACK;
  if (scale === 1 && !fast && !heavy) return null;
  return {
    width: even(source.width),
    height: even(source.height),
    bitrate,
    audioBitrate: step.audioBitrate,
    ...(fast ? { frameRate: step.frameRate } : {}),
  };
}

/** Без сжатия, но без метаданных — перекодировать почти без потерь, в исходном размере. */
const UNCOMPRESSED_QUALITY = 0.92;

/**
 * Когда фото и видео в ленте загружаются сами. У нативной (и Telegram) есть третий ответ —
 * «только по Wi-Fi», — но браузер сеть почти не различает (только Chromium, и то не всегда):
 * обещать его здесь — обещать то, что в Safari и Firefox молча не работает.
 */
export const autoDownloads = ['always', 'never'] as const;
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
