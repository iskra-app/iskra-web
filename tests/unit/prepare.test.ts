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

  it('GIF и обычный файл настройка не трогает', async () => {
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46])], 'a.gif', { type: 'image/gif' });
    const pdf = new File([new Uint8Array([0x25])], 'a.pdf', { type: 'application/pdf' });
    expect((await prepareFile(gif, settings(true))).blob).toBe(gif);
    expect((await prepareFile(pdf, settings(true))).blob).toBe(pdf);
  });
});
