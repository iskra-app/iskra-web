import { describe, expect, it } from 'vitest';
import { photoPlan, renamed } from '../../src/features/media/mediaSettings';

const settings = (stripMetadata: boolean, compress: boolean) => ({ stripMetadata, compress, compression: 'balanced' as const });

describe('фото перед отправкой', () => {
  it('ничего не велено — не трогать', () => {
    expect(photoPlan('image/jpeg', 4000, 3000, settings(false, false))).toBeNull();
  });

  it('сжатие: длинная сторона до 2048, пропорции те же; маленькое без метаданных — не трогать', () => {
    expect(photoPlan('image/jpeg', 4000, 3000, settings(false, true))).toEqual({ width: 2048, height: 1536, mimetype: 'image/jpeg', quality: 0.75 });
    expect(photoPlan('image/jpeg', 800, 600, settings(false, true))).toBeNull();
  });

  it('без метаданных — перекодировать всегда, даже маленькое; не увеличивать', () => {
    expect(photoPlan('image/jpeg', 800, 600, settings(true, true))).toEqual({ width: 800, height: 600, mimetype: 'image/jpeg', quality: 0.75 });
    expect(photoPlan('image/jpeg', 4000, 3000, settings(true, false))).toMatchObject({ width: 4000, height: 3000, quality: 0.92 });
  });

  it('PNG остаётся PNG, WebP — WebP, остальное — JPEG и с новым именем', () => {
    expect(photoPlan('image/png', 100, 100, settings(true, true))?.mimetype).toBe('image/png');
    expect(photoPlan('image/webp', 100, 100, settings(true, true))?.mimetype).toBe('image/webp');
    expect(photoPlan('image/avif', 100, 100, settings(true, true))?.mimetype).toBe('image/jpeg');
    expect(renamed('IMG_1.HEIC.avif', 'image/jpeg')).toBe('IMG_1.HEIC.jpg');
    expect(renamed('.png', 'image/png')).toBe('image.png');
  });
});
