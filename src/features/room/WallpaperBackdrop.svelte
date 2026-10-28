<!--
  Что за перепиской — `WallpaperBackdrop` нативной Искры. Градиент или своё фото, и поверх —
  вуаль: в тёмной теме чёрная, в светлой белая (`--wallpaper-veil`). Обои уводятся к странице,
  вместо которой стоят: светлое приложение с затемнённой картинкой — тёмная комната посреди
  белой, а пузыри и шапка, настроенные под светлую страницу, лежали бы на ней наклейками. Позади всего и недоступно ничему: фон, проглотивший нажатие, предназначенное
  сообщению, был бы худшим из багов.
-->
<script lang="ts">
  import { preferences } from '../app/preferences.svelte.ts';
  import { wallpaperPhoto } from '../app/wallpaperPhoto.svelte.ts';

  $effect(() => {
    if (preferences.wallpaper === 'photo') wallpaperPhoto.load();
  });
</script>

{#if preferences.wallpaper !== 'none'}
  <div class="backdrop" data-wallpaper-kind={preferences.wallpaper} aria-hidden="true">
    {#if preferences.wallpaper === 'photo'}
      {#if wallpaperPhoto.url}<img src={wallpaperPhoto.url} alt="" draggable="false" />{/if}
    {:else}
      <div class="gradient"></div>
    {/if}
    <div class="dim" style:--dim={preferences.wallpaperDimming}></div>
  </div>
{/if}

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    /* Под всем в комнате: комната — свой контекст наложения (`isolation`), и −1 не уходит ниже её. */
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
  }
  .gradient,
  img,
  .dim {
    position: absolute;
    inset: 0;
  }
  .gradient {
    background: linear-gradient(to bottom, var(--wallpaper-top), var(--wallpaper-bottom));
  }
  /* Заполнить, а не вписать: обои с полосами по краям — не обои. */
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .dim {
    background: var(--wallpaper-veil);
    opacity: var(--dim);
  }
</style>
