import { describe, expect, it } from 'vitest';
import { centreSize, qrModules, qrPath } from '../../src/design/qr';

describe('QR-код', () => {
  it('чистый квадрат под искру — нечётный, от четверти до трети стороны', () => {
    for (const width of [21, 25, 29, 33, 37, 41, 57]) {
      const size = centreSize(width);
      expect(size % 2).toBe(1);
      expect(size / width).toBeGreaterThan(0.25);
      expect(size / width).toBeLessThan(0.34);
    }
  });

  it('середина очищена целыми модулями, остальное — как выдал кодировщик', () => {
    const modules = qrModules('https://matrix.to/#/%40alice%3Ademo.iskra.invalid');
    const centre = centreSize(modules.size);
    const from = (modules.size - centre) / 2;
    for (let y = from; y < from + centre; y += 1) {
      for (let x = from; x < from + centre; x += 1) expect(modules.dark[y]![x]).toBe(false);
    }
    // Угловые метки на месте: камера ищет код по ним.
    expect(modules.dark[0]![0]).toBe(true);
    expect(modules.dark[0]![modules.size - 1]).toBe(true);
    expect(modules.dark[modules.size - 1]![0]).toBe(true);
    expect(modules.sparkFraction).toBeCloseTo((centre - 2) / modules.size);
  });

  it('путь — прямоугольники по строкам, без пустых', () => {
    const path = qrPath(qrModules('@alice:demo.iskra.invalid'));
    expect(path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
    expect(path).not.toContain('h0');
  });
});
