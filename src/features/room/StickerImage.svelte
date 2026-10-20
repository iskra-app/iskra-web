<!--
  Картинка стикера из набора — в панели, на вкладке, в настройках. Своим размером, без рамки:
  прозрачность — это и есть стикер.
-->
<script lang="ts">
  import type { MediaLoader } from '../../core/media/media';
  import { stickerAttachment, type Sticker } from '../../core/stickers/imagePack';

  let { sticker, media, size }: { sticker: Sticker; media: MediaLoader; size: 'cell' | 'tab' } = $props();

  let url = $state<string | undefined>();
  $effect(() => {
    const key = sticker.url;
    const px = (size === 'cell' ? 72 : 32) * (window.devicePixelRatio || 1);
    url = undefined;
    void media.preview(stickerAttachment(sticker), px).then((loaded) => {
      if (sticker.url === key) url = loaded;
    });
  });
</script>

<span class="picture {size}">
  {#if url}<img src={url} alt="" draggable="false" />{/if}
</span>

<style>
  .picture {
    display: grid;
    place-items: center;
    flex: none;
  }
  .cell {
    width: var(--size-sticker-cell);
    height: var(--size-sticker-cell);
  }
  .tab {
    width: var(--size-sticker-tab);
    height: var(--size-sticker-tab);
  }
  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
</style>
