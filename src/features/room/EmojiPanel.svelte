<!--
  «Больше эмодзи» — `EmojiPanel` нативной Искры: сетка, которая листается по разделам, и ряд
  вкладок внизу, прыгающих к ним, — как системная панель эмодзи, которую люди уже знают.
  Наверху — двенадцать недавних двумя рядами по шесть, под ряд быстрых реакций. Поиска нет,
  как и там.

  Вкладки — значками, а не эмодзи своего раздела: смайлик «смайлики» не отличить от смайлика,
  который можно отправить, а этот ряд не отправляется.

  С клавиатуры: стрелки ходят по сетке — вверх и вниз на ряд, а не на соседа по списку.
  Колёсико листает панель, а не закрывает меню, как над остальным меню.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons, type IconName } from '../../design/icons.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import { emojiCatalog, emojiCategories, type EmojiCategory } from './emojiCatalog';

  interface Props {
    /** Свои реакции на это сообщение — подсвечены: нажать ещё раз — снять. */
    mine: ReadonlySet<string>;
    recent: readonly string[];
    onpick: (emoji: string) => void;
  }
  let { mine, recent, onpick }: Props = $props();

  const glyphs: Record<EmojiCategory, IconName> = {
    smileys: 'emojiSmileys',
    animals: 'emojiAnimals',
    food: 'emojiFood',
    activity: 'emojiActivity',
    places: 'emojiPlaces',
    objects: 'emojiObjects',
    symbols: 'emojiSymbols',
    flags: 'emojiFlags',
  };

  let scroller: HTMLDivElement | undefined = $state();
  let selected = $state<EmojiCategory>('smileys');
  const sections: Partial<Record<EmojiCategory | 'recent', HTMLElement>> = $state({});

  /** Вкладка — прыжок к разделу. Вкладка следует за нажатием, а не за прокруткой. */
  function jump(category: EmojiCategory) {
    selected = category;
    const heading = sections[category];
    if (scroller && heading) scroller.scrollTop = heading.offsetTop - scroller.offsetTop;
  }

  /** Стрелки по сетке — геометрией: вверх и вниз — в соседний ряд, ближайший по горизонтали. */
  function onkeydown(event: KeyboardEvent) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const cells = [...(scroller?.querySelectorAll<HTMLButtonElement>('.cell') ?? [])];
    const at = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    event.stopPropagation();
    let target: HTMLButtonElement | undefined;
    if (event.key === 'ArrowLeft') target = cells[at - 1];
    else if (event.key === 'ArrowRight') target = cells[at + 1];
    else {
      const here = cells[at]!.getBoundingClientRect();
      const down = event.key === 'ArrowDown';
      const step = down ? 1 : -1;
      let row: number | undefined;
      let best = Infinity;
      for (let i = at + step; i >= 0 && i < cells.length; i += step) {
        const box = cells[i]!.getBoundingClientRect();
        const beyond = down ? box.top >= here.bottom - 1 : box.bottom <= here.top + 1;
        if (!beyond) continue;
        row ??= box.top;
        if (box.top !== row) break;
        const distance = Math.abs(box.left - here.left);
        if (distance < best) {
          best = distance;
          target = cells[i];
        }
      }
    }
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  }
</script>

{#snippet cell(emoji: string)}
  {@const isMine = mine.has(emoji)}
  <button
    type="button"
    class="cell"
    class:mine={isMine}
    role="menuitemcheckbox"
    aria-checked={isMine}
    aria-label={isMine ? t('message.menu.removeReaction') : t('message.menu.react', { emoji })}
    tabindex="-1"
    onclick={() => onpick(emoji)}>{emoji}</button
  >
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="panel" {onkeydown} onwheel={(event) => event.stopPropagation()}>
  <div class="scroller" bind:this={scroller}>
    {#if recent.length}
      <section>
        <h3 bind:this={sections.recent}>{t('reactions.recent')}</h3>
        <div class="grid six">
          {#each recent as emoji (emoji)}{@render cell(emoji)}{/each}
        </div>
      </section>
    {/if}
    {#each emojiCategories as category (category)}
      <section>
        <h3 bind:this={sections[category]}>{t(`reactions.${category}`)}</h3>
        <div class="grid">
          {#each emojiCatalog[category] as emoji (emoji)}{@render cell(emoji)}{/each}
        </div>
      </section>
    {/each}
  </div>
  <div class="tabs" role="toolbar" aria-label={t('reactions.more')}>
    {#each emojiCategories as category (category)}
      <button type="button" class:selected={selected === category} aria-label={t(`reactions.${category}`)} title={t(`reactions.${category}`)} aria-pressed={selected === category} onclick={() => jump(category)}>
        <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons[glyphs[category]]} /></svg>
      </button>
    {/each}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    width: var(--size-emoji-panel-width);
    max-width: 100%;
  }
  .scroller {
    position: relative;
    height: var(--size-emoji-panel);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-inline: var(--space-close);
  }
  /* Две тысячи кнопок: вне экрана — не раскладывать и не рисовать. */
  section {
    content-visibility: auto;
    contain-intrinsic-size: auto var(--size-emoji-panel);
  }
  h3 {
    display: flex;
    align-items: center;
    height: var(--size-emoji-header);
    margin: 0;
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--size-reaction-cell), 1fr));
    padding-block-end: var(--space-close);
  }
  .grid.six {
    grid-template-columns: repeat(var(--emoji-recent-columns), 1fr);
  }
  .panel .cell {
    justify-content: center;
    min-width: 0;
    height: var(--size-reaction-cell);
    min-height: var(--size-reaction-cell);
    padding: 0;
    border-radius: var(--radius-circle);
    font-size: var(--font-size-title);
  }
  .panel .cell.mine {
    background: var(--color-own-reaction);
  }
  .tabs {
    display: flex;
    padding-inline: var(--space-close);
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .tabs button {
    display: grid;
    flex: 1;
    place-items: center;
    height: var(--tap-target);
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .tabs button.selected {
    color: var(--accent);
  }
  .tabs svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
</style>
