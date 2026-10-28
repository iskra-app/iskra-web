import { describe, expect, it } from 'vitest';
import { buildDemoWorld } from '../../src/core/demo/fixtures';
import { demoMediaLibrary } from '../../src/core/demo/media';

describe('медиа демо-сервера', () => {
  it('видео Ани — настоящий mp4, и событие знает его размер и миниатюру', () => {
    const library = demoMediaLibrary();
    const video = buildDemoWorld(Date.now())
      .rooms.flatMap((room) => room.timeline)
      .find((event) => event.content?.['msgtype'] === 'm.video');
    expect(video).toBeDefined();
    const info = video!.content!['info'] as { size: number; thumbnail_url: string };
    const clip = library.get(String(video!.content!['url']).split('/').pop()!)!;
    expect(clip.type).toBe('video/mp4');
    expect(new TextDecoder().decode(clip.bytes.slice(4, 8))).toBe('ftyp');
    expect(clip.bytes.length).toBe(info.size);
    expect(library.get(info.thumbnail_url.split('/').pop()!)?.type).toBe('image/jpeg');
  });
});
