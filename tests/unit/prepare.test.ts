import { describe, expect, it } from 'vitest';
import { MetadataNotRemovedError, prepareFile } from '../../src/features/media/prepare';

const settings = (stripMetadata: boolean) => ({ stripMetadata, compress: false, compression: 'balanced' as const });

// Под Node нет ни `createImageBitmap`, ни `<img>`: фото не перерисовать — ровно тот случай, когда
// раньше уходил оригинал со всем, что в нём было.
describe('без метаданных — или не уходит', () => {
  it('фото, которое не удалось перерисовать, не отправляется', async () => {
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1])], 'IMG_1.jpg', { type: 'image/jpeg' });
    await expect(prepareFile(photo, settings(true))).rejects.toBeInstanceOf(MetadataNotRemovedError);
  });

  it('MP4, который не разобрался, не отправляется', async () => {
    const video = new File([new Uint8Array(64)], 'clip.mp4', { type: 'video/mp4' });
    await expect(prepareFile(video, settings(true))).rejects.toMatchObject({ fileName: 'clip.mp4' });
  });

  it('с выключенной настройкой уходит как есть', async () => {
    const photo = new File([new Uint8Array([0xff, 0xd8])], 'IMG_1.jpg', { type: 'image/jpeg' });
    const prepared = await prepareFile(photo, settings(false));
    expect(prepared.blob).toBe(photo);
  });

  it('обычный файл настройка не трогает', async () => {
    const pdf = new File([new Uint8Array([0x25])], 'a.pdf', { type: 'application/pdf' });
    expect((await prepareFile(pdf, settings(true))).blob).toBe(pdf);
  });

  it('GIF чистится по байтам; неразборчивый — не уходит', async () => {
    const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
    const gif = [...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0, 0x21, 0xfe, 3, ...ascii('Cam'), 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x4c, 0x01, 0, 0x3b];
    const prepared = await prepareFile(new File([new Uint8Array(gif)], 'a.gif', { type: 'image/gif' }), settings(true));
    expect(String.fromCharCode(...new Uint8Array(await prepared.blob.arrayBuffer()))).not.toContain('Cam');
    const broken = new File([new Uint8Array([0x47, 0x49, 0x46])], 'b.gif', { type: 'image/gif' });
    await expect(prepareFile(broken, settings(true))).rejects.toBeInstanceOf(MetadataNotRemovedError);
  });
});
