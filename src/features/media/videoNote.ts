/**
 * «Кружочек» — то, что не зависит от камеры: формат, размер, сжатие и как кадр камеры
 * становится квадратом. Числа — `VideoNote` нативной Искры.
 *
 * Формат — только H.264 и AAC в mp4: нативная Искра шлёт «кружочки» так, и `AVPlayer` на
 * iPhone WebM не играет (см. план, «Кодеки»). Где браузер так не пишет — камеры в композере нет.
 *
 * Узнаётся «кружочек» по форме, как в нативной: ровно квадрат и не дольше минуты — обычное
 * `m.video`, никаких своих полей (`core/rooms/preview.ts`, `isVideoNote`).
 */

/** Потолок записи — его же проверяет распознавание. */
export const VIDEO_NOTE_MAX_MS = 60_000;
/** Сторона квадрата, px. */
export const VIDEO_NOTE_SIDE = 480;
export const VIDEO_NOTE_FPS = 30;
/**
 * Десятая бита на пиксель в секунду — обычная рабочая цифра H.264 для говорящего лица: около
 * 700 кбит/с, минута — около пяти мегабайт, а не тридцати.
 */
export const VIDEO_NOTE_BITRATE = Math.round(VIDEO_NOTE_SIDE * VIDEO_NOTE_SIDE * 0.1 * VIDEO_NOTE_FPS);

/** H.264 и AAC — кодеки явно: «просто mp4» бывает с Opus внутри, а его iPhone не сыграет. */
const CANDIDATES = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs="avc1.42E01F, mp4a.40.2"', 'video/mp4;codecs=avc1,mp4a.40.2'];

/** Что просить у `MediaRecorder`, или `null` — «кружочка» не записать. */
export function videoNoteMimeType(recorder: { isTypeSupported(type: string): boolean } | undefined = globalThis.MediaRecorder): string | null {
  if (!recorder || typeof recorder.isTypeSupported !== 'function') return null;
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  if (typeof HTMLCanvasElement === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  return CANDIDATES.find((type) => recorder.isTypeSupported(type)) ?? null;
}

/**
 * Квадрат из середины кадра: у вебкамеры 16:9 обрезаются бока, у телефона стоймя — верх и низ.
 * Возвращает, какой кусок кадра брать.
 */
export function squareCrop(width: number, height: number): { x: number; y: number; side: number } {
  const side = Math.min(width, height);
  return { x: (width - side) / 2, y: (height - side) / 2, side };
}
