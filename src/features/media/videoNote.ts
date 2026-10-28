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
 * Возвращает, какой кусок кадра брать; `zoom` больше 1 — кусок меньше, вокруг той же середины.
 */
export function squareCrop(width: number, height: number, zoom = 1): { x: number; y: number; side: number } {
  const side = Math.min(width, height) / Math.max(1, zoom);
  return { x: (width - side) / 2, y: (height - side) / 2, side };
}

/**
 * Насколько ближе можно щипком — `maximumZoom` нативной: фронтальная — вдвое, задняя — впятеро;
 * дальше лицо в кружке — поры, а цифровое приближение за пределом матрицы — каша. Камера,
 * которая умеет приближать сама (`MediaTrackCapabilities.zoom`), — не дальше своего предела;
 * не умеет — приближаем обрезкой кадра, и тут честный предел вдвое: из 640 px камеры в 480 px
 * кружка.
 */
export function videoNoteZoomLimit(facing: 'user' | 'environment', lens: { min: number; max: number } | null): number {
  const wanted = facing === 'user' ? 2 : 5;
  if (!lens) return Math.min(wanted, 2);
  return Math.max(1, Math.min(wanted, lens.max / lens.min));
}

/**
 * Круг, снаружи которого углы кадра закрашиваются чёрным, — `SquareVideoExporter` нативной.
 *
 * Круг в ленте — маска на плеере: пиксели за ним остаются в файле, и любой другой клиент Matrix
 * их покажет. А там — комната, в которой человек сидел и которую не видел: видоискатель был
 * круглым. Поэтому углы уходят в файл чёрными — прозрачности у H.264 в mp4 нет.
 *
 * Круг чуть шире кадра (`1.04`, как в нативной): иначе на краю нашей же маски в ленте сглаживание
 * двух кругов дало бы тёмную кайму. Углы кадра — в 0,707 стороны от центра, радиуса 0,52 им хватает.
 */
export const VIDEO_NOTE_MASK_OVERSHOOT = 1.04;

/** Закрасить углы квадрата `side` чёрным: квадрат с круглой дырой, заливка even-odd. */
export function paintCorners(context: Pick<CanvasRenderingContext2D, 'beginPath' | 'rect' | 'arc' | 'fill' | 'fillStyle'>, side: number): void {
  const r = (side * VIDEO_NOTE_MASK_OVERSHOOT) / 2;
  context.beginPath();
  context.rect(0, 0, side, side);
  context.arc(side / 2, side / 2, r, 0, Math.PI * 2);
  context.fillStyle = 'black';
  context.fill('evenodd');
}
