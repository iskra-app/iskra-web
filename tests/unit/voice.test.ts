import { afterEach, describe, expect, it, vi } from 'vitest';
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
