import { describe, expect, it } from 'vitest';
import { clampZoom, cropRect, MAX_SIDE, MAX_ZOOM, outputSide, zoomAt, type Crop } from '../../src/features/media/avatarCrop';

/** Арифметика обрезки фото профиля — `AvatarCropTests` нативной. */
describe('обрезка фото профиля', () => {
  const landscape = { width: 4000, height: 3000 };
  const at = (rest: Partial<Crop> = {}): Crop => ({ image: landscape, side: 300, zoom: 1, offset: { x: 0, y: 0 }, ...rest });

  it('в покое квадрат — середина снимка, короткая сторона от края до края', () => {
    expect(cropRect(at())).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
  });

  it('снимок не сдвинуть так, чтобы квадрат вышел за его край', () => {
    const far = cropRect(at({ offset: { x: 10_000, y: 10_000 } }));
    expect(far.x).toBe(0);
    expect(far.y).toBe(0);
    const left = cropRect(at({ offset: { x: -10_000, y: 0 } }));
    expect(left.x + left.width).toBe(landscape.width);
  });

  it('приближение берёт меньшую часть снимка, а масштаб — между 1 и наибольшим', () => {
    expect(cropRect(at({ zoom: 2 })).width).toBe(1500);
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });

  it('приближение к точке держит её на месте, отдаление обратно — снова в рамке', () => {
    // Точка в 60 точках правее центра квадрата: до и после — тот же пиксель снимка под ней.
    const before = at();
    const after = zoomAt(before, 2, 60, 0);
    const pixelUnder = (c: Crop) => {
      const r = cropRect(c);
      return r.x + r.width / 2 + (60 / c.side) * r.width;
    };
    expect(pixelUnder(after)).toBeCloseTo(pixelUnder(before));
    expect(cropRect(zoomAt(after, 1, 60, 0))).toEqual(cropRect(before));
  });

  it('уходит квадрат не больше наибольшего; меньший снимок — как есть', () => {
    expect(outputSide(at())).toBe(MAX_SIDE);
    expect(outputSide(at({ image: { width: 600, height: 400 } }))).toBe(400);
  });
});
