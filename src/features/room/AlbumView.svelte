<!--
  Альбом — фото и видео, отправленные вместе, одним пузырём (`AlbumBubble` нативной). Какие —
  решает `core/timeline/album.ts`, где какая — мозаика (`design/albumMosaic.ts`). Каждая плитка
  открывает просмотрщик на себе, с остальными картинками чата по бокам. Подпись — у первого
  сообщения, её рисует строка под альбомом, как под одним фото.
-->
<script lang="ts">
  import { bottom, mosaic, type Frame } from '../../design/albumMosaic';
  import type { MediaLoader } from '../../core/media/media';
  import type { Message } from '../../core/timeline/message';
  import MediaPreview from '../media/MediaPreview.svelte';

  interface Props {
    items: Message[];
    media: MediaLoader;
    onopen: (message: Message) => void;
  }
  let { items, media, onopen }: Props = $props();

  /*
   * Мозаика считает в долях ширины. Ширина альбома — `--size-media-max-width` (320), потолок
   * высоты — `--size-media-max-height` (400), зазор — `--space-within-run` (2): те же размеры,
   * что у одного фото, переведённые в доли.
   */
  const MAX_HEIGHT = 400 / 320;
  const GAP = 2 / 320;

  const ratioOf = (m: Message) => {
    const a = m.kind.type === 'image' || m.kind.type === 'video' ? m.kind.attachment : undefined;
    return a?.width && a.height ? a.width / a.height : 1;
  };
  const frames = $derived(mosaic(items.map(ratioOf), GAP, MAX_HEIGHT));
  const height = $derived(bottom(frames));

  /** Форма альбома — через CSSOM: атрибут `style` строгая CSP не пропустит. */
  function shape(node: HTMLElement, h: number) {
    const set = (v: number) => node.style.setProperty('--album-height', String(v));
    set(h);
    return { update: set };
  }
  function place(node: HTMLElement, frame: { f: Frame; h: number }) {
    const set = ({ f, h }: { f: Frame; h: number }) => {
      node.style.setProperty('left', `${f.x * 100}%`);
      node.style.setProperty('width', `${f.width * 100}%`);
      node.style.setProperty('top', `${(f.y / h) * 100}%`);
      node.style.setProperty('height', `${(f.height / h) * 100}%`);
    };
    set(frame);
    return { update: set };
  }
</script>

<span class="album" use:shape={height}>
  {#each items as item, i (item.key)}
    {#if frames[i] && (item.kind.type === 'image' || item.kind.type === 'video')}
      <span class="tile" use:place={{ f: frames[i], h: height }}>
        <MediaPreview kind={item.kind.type} attachment={item.kind.attachment} {media} own={item.own} tile onopen={() => onopen(item)} />
      </span>
    {/if}
  {/each}
</span>

<style>
  .album {
    position: relative;
    display: block;
    width: var(--size-media-max-width);
    max-width: 100%;
    aspect-ratio: 1 / var(--album-height, 1);
    border-radius: var(--radius-picture);
    overflow: hidden;
  }
  .tile {
    position: absolute;
    display: block;
  }
</style>
