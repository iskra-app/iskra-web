<!--
  Стикеры — `StickerPicker` нативной Искры, панель стикеров Telegram: сначала недавние, потом
  каждый набор под своим именем, и ряд картинок наборов сверху, прыгающий к ним.

  Нажатие отправляет сразу и закрывает панель: «выбрал, теперь нажми отправить» здесь нет,
  стикер — реплика. Правая кнопка или долгое нажатие — «Добавить в мои стикеры» или «Убрать»,
  как у стикера в чате: найденный в наборе чата можно оставить себе, никому его не отправляя.

  Наборы читаются заново при каждом открытии: набор — чужой, и его меняют.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import Menu from '../../design/Menu.svelte';
  import { viewport } from '../../design/viewport.svelte.ts';
  import type { MediaLoader } from '../../core/media/media';
  import type { Sticker, StickerPack } from '../../core/stickers/imagePack';
  import type { StickerLibrary } from '../../core/stickers/stickerLibrary.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import StickerImage from './StickerImage.svelte';
  import { stickerArt, stickerSources } from './stickers';

  interface Props {
    library: StickerLibrary;
    media: MediaLoader;
    roomId: string;
    onpick: (sticker: Sticker) => void;
  }
  let { library, media, roomId, onpick }: Props = $props();

  const RECENT = 'recent';

  $effect(() => {
    void library.load(roomId, stickerSources(), stickerArt);
  });

  let scroller: HTMLDivElement | undefined = $state();
  let selected = $state(RECENT);
  const headings: Record<string, HTMLElement> = $state({});

  /** Пункт с действием над стикером — у точки, где нажали. */
  let menu = $state<{ sticker: Sticker; x: number; y: number } | null>(null);

  const empty = $derived(!library.packs.length && !library.recent.length);

  function nameOf(pack: StickerPack): string {
    if (pack.origin.kind === 'mine') return t('stickers.mine');
    if (pack.origin.kind === 'builtIn') return t('stickers.builtIn');
    return pack.name ?? t('stickers.roomPack');
  }

  function jump(id: string) {
    selected = id;
    const heading = headings[id];
    if (scroller && heading) scroller.scrollTop = heading.offsetTop - scroller.offsetTop;
  }

  function onkeydown(event: KeyboardEvent) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const cells = [...(scroller?.querySelectorAll<HTMLButtonElement>('.cell') ?? [])];
    const at = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const columns = Math.max(1, Math.round((scroller?.clientWidth ?? 1) / (cells[0]?.offsetWidth || 1)));
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key] ?? 0;
    const target = cells[Math.max(0, Math.min(cells.length - 1, at + step))];
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  }
</script>

{#snippet section(id: string, title: string, stickers: readonly Sticker[], subscribing?: StickerPack)}
  <section>
    <div class="header" bind:this={headings[id]}>
      <h3>{title}</h3>
      {#if subscribing}
        <button type="button" class="subscribe" onclick={() => void library.subscribe(subscribing)}>
          <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.plus} /></svg>
          {t('stickers.subscribe')}
        </button>
      {/if}
    </div>
    <div class="grid">
      {#each stickers as sticker (sticker.url)}
        <button
          type="button"
          class="cell"
          role="menuitem"
          tabindex="-1"
          aria-label={sticker.body}
          title={sticker.body}
          onclick={() => onpick(sticker)}
          oncontextmenu={(event) => {
            event.preventDefault();
            menu = { sticker, x: event.clientX, y: event.clientY };
          }}
        >
          <StickerImage {sticker} {media} size="cell" />
        </button>
      {/each}
    </div>
  </section>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="panel" {onkeydown} onwheel={(event) => event.stopPropagation()}>
  {#if empty}
    <div class="empty">
      {#if library.loaded && !library.loading}
        <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.emojiSmileys} /></svg>
        <strong>{t('stickers.empty.title')}</strong>
        <p>{t('stickers.empty.message')}</p>
      {/if}
      <!-- Пустая панель всё равно меню: фокусу нужно, куда встать. -->
      <span role="menuitem" tabindex="-1" aria-label={t('stickers.title')}></span>
    </div>
  {:else}
    <div class="tabs" role="toolbar" aria-label={t('stickers.title')}>
      {#if library.recent.length}
        <button type="button" class:selected={selected === RECENT} aria-label={t('stickers.recent')} title={t('stickers.recent')} aria-pressed={selected === RECENT} onclick={() => jump(RECENT)}>
          <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.clock} /></svg>
        </button>
      {/if}
      {#each library.packs as pack (pack.id)}
        <button type="button" class:selected={selected === pack.id} aria-label={nameOf(pack)} title={nameOf(pack)} aria-pressed={selected === pack.id} onclick={() => jump(pack.id)}>
          {#if pack.icon}<StickerImage sticker={pack.icon} {media} size="tab" />{:else}<svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.emojiSmileys} /></svg>{/if}
        </button>
      {/each}
    </div>
    <div class="scroller" bind:this={scroller}>
      {#if library.recent.length}{@render section(RECENT, t('stickers.recent'), library.recent)}{/if}
      {#each library.packs as pack (pack.id)}
        {@render section(pack.id, nameOf(pack), pack.stickers, pack.origin.kind === 'room' && !library.isSubscribed(pack) ? pack : undefined)}
      {/each}
    </div>
  {/if}
</div>

<Menu open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} sheet={!viewport.finePointer} label={menu?.sticker.body ?? ''} onclose={() => (menu = null)}>
  {#if menu}
    {@const sticker = menu.sticker}
    {#if library.isMine(sticker.url)}
      <button
        type="button"
        role="menuitem"
        class="danger"
        onclick={() => {
          menu = null;
          void library.remove(sticker);
        }}>{t('stickers.remove')}</button
      >
    {:else}
      <button
        type="button"
        role="menuitem"
        onclick={() => {
          menu = null;
          void library.add(sticker);
        }}>{t('stickers.add')}</button
      >
    {/if}
  {/if}
</Menu>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    width: var(--size-emoji-panel-width);
    max-width: 100%;
  }
  .tabs {
    display: flex;
    gap: var(--space-close);
    padding: var(--space-tight) var(--space-close);
    overflow-x: auto;
    scrollbar-width: none;
    border-block-end: var(--border-hairline) solid var(--color-separator);
  }
  .tabs button {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--tap-target);
    height: var(--tap-target);
    padding: 0;
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .tabs button.selected {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
  }
  svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
  .scroller {
    height: var(--size-emoji-panel);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-inline: var(--space-close);
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--size-emoji-header);
    padding-block-start: var(--space-close);
  }
  h3 {
    margin: 0;
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  .subscribe {
    display: inline-flex;
    align-items: center;
    gap: var(--space-tight);
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: var(--font-size-caption);
    font-weight: 600;
    cursor: pointer;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--size-sticker-cell), 1fr));
    gap: var(--space-close);
    padding-block-end: var(--space-close);
  }
  .panel .cell {
    display: grid;
    place-items: center;
    min-width: 0;
    padding: 0;
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    cursor: pointer;
  }
  .panel .cell:hover {
    background: var(--color-own-reaction);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-close);
    height: var(--size-emoji-panel);
    padding: var(--space-roomy);
    text-align: center;
  }
  .empty svg {
    width: var(--size-icon-button);
    height: var(--size-icon-button);
    color: var(--color-text-secondary);
  }
  .empty [role='menuitem'] {
    min-height: 0;
    padding: 0;
  }
  .empty p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
</style>
