/**
 * Голосовое — то, что не зависит от микрофона: в каком формате писать, как громкость
 * становится высотой столбика и как живая волна сжимается в те 128 точек, что едут в событии.
 *
 * Формат — только AAC в mp4. Нативная Искра шлёт голосовые в m4a/AAC, и `AVPlayer` на iPhone
 * WebM с Opus не играет (см. план, «Кодеки»): голосовое из браузера, которое не услышат на
 * телефоне, — это два мессенджера, а не один. Где браузер AAC не пишет — кнопки записи нет,
 * слушать чужие можно везде.
 */

/** Сколько точек волны едет в событии — соглашение Matrix, его рисуют и другие клиенты. */
export const WAVEFORM_SAMPLES = 128;
/** Как часто спрашивать громкость, мс: на любое нормальное голосовое точек выходит больше 128. */
export const SAMPLING_MS = 50;
/** Дольше — не сообщение, а подкаст, на который никто не соглашался. Как в нативной. */
export const MAX_DURATION_MS = 300_000;
/** Короче — палец задел кнопку, а не сказал что-то. */
export const MIN_DURATION_MS = 500;

/**
 * Типы, которые просим у `MediaRecorder`, — с кодеком явно: просто `audio/mp4` в Chrome
 * бывает Opus внутри mp4, а его iPhone тоже не играет.
 */
const CANDIDATES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4;codecs="mp4a.40.2"'];

/** Что просить у `MediaRecorder`, или `null` — записывать нечем. */
export function voiceMimeType(recorder: { isTypeSupported(type: string): boolean } | undefined = globalThis.MediaRecorder): string | null {
  if (!recorder || typeof recorder.isTypeSupported !== 'function') return null;
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return CANDIDATES.find((type) => recorder.isTypeSupported(type)) ?? null;
}

/**
 * Децибелы → высота столбика, 0…1. Шкала логарифмическая, и обычная речь сидит в верхних
 * децибелах: нарисованная как есть, волна почти всё время во всю высоту. Пол — −50 дБ (тихая
 * речь, а не шум комнаты), и всё, что выше, растянуто на всю высоту. Число — как в нативной.
 */
export function levelFromDecibels(decibels: number): number {
  const floor = -50;
  if (!(decibels > floor)) return 0;
  return Math.min(1, (decibels - floor) / -floor);
}

/** Громкость отрезка звука (−1…1) в дБ: среднеквадратичное. Тишина — −∞. */
export function decibelsOf(samples: Float32Array): number {
  if (!samples.length) return -Infinity;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return 20 * Math.log10(Math.sqrt(sum / samples.length));
}

/**
 * Снятое — в 128 точек события. Среднее по корзине, а не каждая тридцатая: слово, попавшее
 * между двумя снимками, иначе просто пропадает. Короткое голосовое не растягивается на тишину,
 * которой не было, — дополняется нулями.
 */
export function resampleWaveform(levels: readonly number[], count = WAVEFORM_SAMPLES): number[] {
  if (!levels.length) return new Array<number>(count).fill(0);
  if (levels.length <= count) return [...levels, ...new Array<number>(count - levels.length).fill(0)];
  const bucket = levels.length / count;
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * bucket);
    const end = Math.min(levels.length, Math.floor((index + 1) * bucket));
    if (start >= end) return levels[Math.min(start, levels.length - 1)]!;
    let sum = 0;
    for (let i = start; i < end; i++) sum += levels[i]!;
    return sum / (end - start);
  });
}
