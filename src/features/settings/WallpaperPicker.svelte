<!--
  Обои — рядом плиток: ничего, шесть градиентов, своё фото (`AppearanceView` нативной Искры).
  Плитка — картинка, а не точка: обои выбирают глазами. Своё фото — по нажатию на его
  плитку, пока фото ещё нет, и кнопкой «Выбрать другое фото», когда уже есть. Затемнение —
  только когда есть что затемнять; в светлой теме обои светлеют, а не темнеют, и ползунок зовётся
  «Осветление».
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import PlainButton from '../../design/PlainButton.svelte';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import { MAX_DIMMING, preferences, wallpapers, type Wallpaper } from '../app/preferences.svelte.ts';
  import { colorScheme } from '../app/colorScheme.svelte.ts';
  import { wallpaperPhoto } from '../app/wallpaperPhoto.svelte.ts';

  let { labelledby }: { labelledby: string } = $props();
  let picker: HTMLInputElement | undefined = $state();
  const name = (w: Wallpaper): TextKey => `appearance.wallpaper.${w}`;

  $effect(() => wallpaperPhoto.load());

  function choose(w: Wallpaper) {
    if (w === 'photo' && !wallpaperPhoto.url) picker?.click();
    else preferences.wallpaper = w;
  }

  async function picked() {
    const file = picker?.files?.[0];
    if (picker) picker.value = '';
    if (!file?.type.startsWith('image/')) return;
    await wallpaperPhoto.store(file);
    preferences.wallpaper = 'photo';
  }
</script>

<div class="tiles" role="radiogroup" aria-labelledby={labelledby}>
  {#each wallpapers as w (w)}
    <button
      type="button"
      role="radio"
      class="tile"
      data-wallpaper-kind={w}
      aria-checked={preferences.wallpaper === w}
      aria-label={t(name(w))}
      title={t(name(w))}
      onclick={() => choose(w)}
    >
      {#if w === 'photo'}
        {#if wallpaperPhoto.url}
          <img src={wallpaperPhoto.url} alt="" draggable="false" />
        {:else}
          <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.photo} /></svg>
        {/if}
      {:else if w === 'none'}
        <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.none} /></svg>
      {/if}
    </button>
  {/each}
</div>
<input bind:this={picker} type="file" accept="image/*" hidden onchange={() => void picked()} />

{#if preferences.wallpaper === 'photo' && wallpaperPhoto.url}
  <PlainButton onclick={() => picker?.click()}>{t('appearance.wallpaperChoose')}</PlainButton>
{/if}

{#if preferences.wallpaper !== 'none'}
  <label class="dimming">
    <span>{colorScheme.light ? t('appearance.wallpaperLightening') : t('appearance.wallpaperDimming')}</span>
    <input
      type="range"
      min="0"
      max={MAX_DIMMING}
      step="0.05"
      value={preferences.wallpaperDimming}
      oninput={(event) => (preferences.wallpaperDimming = Number(event.currentTarget.value))}
    />
  </label>
{/if}
<p class="footer">{t('appearance.wallpaperFooter')}</p>

<style>
  .tiles {
    display: flex;
    gap: var(--space-close);
    padding-block: var(--space-tight);
    overflow-x: auto;
  }
  .tile {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    width: var(--size-wallpaper-tile-width);
    height: var(--size-wallpaper-tile-height);
    padding: 0;
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-control);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    overflow: hidden;
    cursor: pointer;
  }
  .tile:not([data-wallpaper-kind='none']):not([data-wallpaper-kind='photo']) {
    background: linear-gradient(to bottom, var(--wallpaper-top), var(--wallpaper-bottom));
  }
  .tile[aria-checked='true'] {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .tile svg {
    width: var(--size-icon-button);
    height: var(--size-icon-button);
    fill: currentColor;
  }
  .dimming {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
  }
  .dimming input {
    flex: 1;
    accent-color: var(--accent);
  }
  .footer {
    margin: 0;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
</style>
