import { afterEach, describe, expect, it, vi } from 'vitest';
import { paintCorners, squareCrop, VIDEO_NOTE_MASK_OVERSHOOT, VIDEO_NOTE_BITRATE, VIDEO_NOTE_MAX_MS, videoNoteMimeType, videoNoteZoomLimit } from '../../src/features/media/videoNote';
import { decibelsOf, levelFromDecibels, resampleWaveform, voiceMimeType, WAVEFORM_SAMPLES } from '../../src/features/media/voice';

describe('волна голосового', () => {
  it('децибелы → высота: ниже −50 — ноль, 0 дБ — во всю высоту', () => {
    expect(levelFromDecibels(-Infinity)).toBe(0);
    expect(levelFromDecibels(-60)).toBe(0);
    expect(levelFromDecibels(-25)).toBeCloseTo(0.5);
    expect(levelFromDecibels(0)).toBe(1);
    expect(levelFromDecibels(6)).toBe(1);
    expect(levelFromDecibels(Number.NaN)).toBe(0);
  });

  it('громкость отрезка — среднеквадратичное в дБ', () => {
    expect(decibelsOf(new Float32Array(8))).toBe(-Infinity);
    expect(decibelsOf(new Float32Array([1, -1, 1, -1]))).toBeCloseTo(0);
    expect(decibelsOf(new Float32Array([0.1, -0.1]))).toBeCloseTo(-20);
  });

  it('короткое — дополняется нулями, а не растягивается', () => {
    const waveform = resampleWaveform([0.5, 1]);
    expect(waveform).toHaveLength(WAVEFORM_SAMPLES);
    expect(waveform.slice(0, 3)).toEqual([0.5, 1, 0]);
    expect(resampleWaveform([])).toEqual(new Array(WAVEFORM_SAMPLES).fill(0));
  });

  it('длинное — среднее по корзине: слово между снимками не пропадает', () => {
    const levels = Array.from({ length: 4 * WAVEFORM_SAMPLES }, (_, i) => (i % 4 === 1 ? 1 : 0));
    const waveform = resampleWaveform(levels);
    expect(waveform).toHaveLength(WAVEFORM_SAMPLES);
    for (const level of waveform) expect(level).toBeCloseTo(0.25);
  });
});

describe('формат записи', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('AAC в mp4 с кодеком явно — там, где есть микрофон', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => Promise.reject(new Error('нет')) } });
    expect(voiceMimeType({ isTypeSupported: (type) => type.startsWith('audio/mp4;codecs=') })).toBe('audio/mp4;codecs=mp4a.40.2');
    vi.stubGlobal('navigator', {});
    expect(voiceMimeType({ isTypeSupported: () => true })).toBeNull();
  });

  it('только AAC: Opus и «просто mp4» не годятся — iPhone их не сыграет', () => {
    expect(voiceMimeType({ isTypeSupported: (type) => type === 'audio/webm;codecs=opus' })).toBeNull();
    expect(voiceMimeType({ isTypeSupported: (type) => type === 'audio/mp4' })).toBeNull();
    expect(voiceMimeType(undefined)).toBeNull();
  });
});

describe('«кружочек»', () => {
  it('углы кадра — чёрные: квадрат с дырой чуть шире круга, even-odd; углы снаружи дыры', () => {
    const calls: unknown[][] = [];
    const context = {
      fillStyle: '',
      beginPath: () => calls.push(['beginPath']),
      rect: (...a: number[]) => calls.push(['rect', ...a]),
      arc: (...a: number[]) => calls.push(['arc', ...a]),
      fill: (rule?: string) => calls.push(['fill', rule]),
    };
    paintCorners(context as never, 480);
    expect(context.fillStyle).toBe('black');
    expect(calls).toEqual([['beginPath'], ['rect', 0, 0, 480, 480], ['arc', 240, 240, 240 * VIDEO_NOTE_MASK_OVERSHOOT, 0, Math.PI * 2], ['fill', 'evenodd']]);
    // Угол — в 0,707 стороны от центра: дыра его не достаёт, а свой круг в ленте (0,5) — внутри дыры.
    expect(Math.hypot(240, 240)).toBeGreaterThan(240 * VIDEO_NOTE_MASK_OVERSHOOT);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('квадрат — из середины кадра: у вебкамеры обрезаются бока, у телефона — верх и низ', () => {
    expect(squareCrop(1280, 720)).toEqual({ x: 280, y: 0, side: 720 });
    expect(squareCrop(720, 1280)).toEqual({ x: 0, y: 280, side: 720 });
    expect(squareCrop(480, 480)).toEqual({ x: 0, y: 0, side: 480 });
    // Щипок: кусок вдвое меньше вокруг той же середины; меньше 1 — как 1.
    expect(squareCrop(1280, 720, 2)).toEqual({ x: 460, y: 180, side: 360 });
    expect(squareCrop(480, 480, 0.5)).toEqual({ x: 0, y: 0, side: 480 });
  });

  it('щипок «кружочка»: фронтальная — до 2×, задняя — до 5×, но не дальше объектива; без зума камеры — обрезкой до 2×', () => {
    expect(videoNoteZoomLimit('user', { min: 1, max: 10 })).toBe(2);
    expect(videoNoteZoomLimit('environment', { min: 1, max: 10 })).toBe(5);
    expect(videoNoteZoomLimit('environment', { min: 1, max: 3 })).toBe(3);
    expect(videoNoteZoomLimit('environment', null)).toBe(2);
    expect(videoNoteZoomLimit('user', null)).toBe(2);
  });

  it('сжатие — десятая бита на пиксель: около 700 кбит/с, минута — около пяти мегабайт', () => {
    expect(VIDEO_NOTE_BITRATE).toBe(691_200);
    expect((VIDEO_NOTE_BITRATE * VIDEO_NOTE_MAX_MS) / 1000 / 8 / 1e6).toBeCloseTo(5.2, 1);
  });

  it('только H.264 с AAC: WebM и mp4 с Opus не годятся', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => Promise.reject(new Error('нет')) } });
    vi.stubGlobal('HTMLCanvasElement', class {
      captureStream() {}
    });
    expect(videoNoteMimeType({ isTypeSupported: (type) => type.startsWith('video/webm') })).toBeNull();
    expect(videoNoteMimeType({ isTypeSupported: (type) => type === 'video/mp4;codecs=avc1,opus' })).toBeNull();
    expect(videoNoteMimeType({ isTypeSupported: (type) => type.includes('avc1') && type.includes('mp4a.40.2') })).toBe('video/mp4;codecs=avc1.42E01F,mp4a.40.2');
    // Без `captureStream` у канваса записывать нечего — камеры нет.
    vi.stubGlobal('HTMLCanvasElement', class {});
    expect(videoNoteMimeType({ isTypeSupported: () => true })).toBeNull();
  });
});
