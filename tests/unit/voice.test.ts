import { afterEach, describe, expect, it, vi } from 'vitest';
import { squareCrop, VIDEO_NOTE_BITRATE, VIDEO_NOTE_MAX_MS, videoNoteMimeType } from '../../src/features/media/videoNote';
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
  afterEach(() => vi.unstubAllGlobals());

  it('квадрат — из середины кадра: у вебкамеры обрезаются бока, у телефона — верх и низ', () => {
    expect(squareCrop(1280, 720)).toEqual({ x: 280, y: 0, side: 720 });
    expect(squareCrop(720, 1280)).toEqual({ x: 0, y: 280, side: 720 });
    expect(squareCrop(480, 480)).toEqual({ x: 0, y: 0, side: 480 });
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
