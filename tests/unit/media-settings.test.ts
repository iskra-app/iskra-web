import { describe, expect, it } from 'vitest';
import { photoPlan, renamed, videoPlan } from '../../src/features/media/mediaSettings';

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

describe('видео перед отправкой — числа нативной', () => {
  it('4K с телефона вписывается в рамку ступени, с её битрейтом и не больше 30 кадров', () => {
    const phone = { width: 3840, height: 2160, bitrate: 45_000_000, frameRate: 60 };
    expect(videoPlan(phone, 'strong')).toEqual({ width: 960, height: 540, bitrate: 1_200_000, audioBitrate: 64_000, frameRate: 30 });
    expect(videoPlan(phone, 'balanced')).toEqual({ width: 1280, height: 720, bitrate: 2_500_000, audioBitrate: 96_000, frameRate: 30 });
    // Шестьдесят кадров — только на лёгкой.
    expect(videoPlan(phone, 'light')).toEqual({ width: 1920, height: 1080, bitrate: 5_000_000, audioBitrate: 128_000 });
  });

  it('вертикальное — короткая сторона по короткой стороне рамки; стороны чётные', () => {
    expect(videoPlan({ width: 1080, height: 1920, bitrate: 12_000_000 }, 'balanced')).toMatchObject({ width: 720, height: 1280 });
    expect(videoPlan({ width: 1280, height: 808, bitrate: 8_000_000 }, 'balanced')).toMatchObject({ width: 1140, height: 720 });
    expect(videoPlan({ width: 1001, height: 3001, bitrate: 8_000_000 }, 'strong')).toMatchObject({ width: 320, height: 960 });
  });

  it('кадр не растягивается, а битрейт не поднимается выше исходного', () => {
    expect(videoPlan({ width: 640, height: 360, bitrate: 4_000_000 }, 'balanced')).toMatchObject({ width: 640, height: 360, bitrate: 2_500_000 });
    expect(videoPlan({ width: 3840, height: 2160, bitrate: 900_000 }, 'balanced')).toMatchObject({ bitrate: 900_000 });
  });

  it('уже лёгкое видео не пережимается: выигрывать нечего', () => {
    expect(videoPlan({ width: 1280, height: 720, bitrate: 2_000_000, frameRate: 30 }, 'balanced')).toBeNull();
    expect(videoPlan({ width: 640, height: 480, bitrate: 2_600_000, frameRate: 29.97 }, 'balanced')).toBeNull();
    // Неизвестный битрейт — пережимаем: проверить нечем.
    expect(videoPlan({ width: 640, height: 480 }, 'balanced')).not.toBeNull();
  });
});
