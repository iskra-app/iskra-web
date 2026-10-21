<!--
  Шапка колонки. «Стекло» — только в навигационном слое, и это он: полупрозрачность и
  размытие, если браузер их тянет, иначе непрозрачная заливка.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    leading?: Snippet;
    title: string;
    /** Строка под заголовком — как у шапки чата в нативной: кто печатает, кто это, сколько их. */
    subtitle?: string;
    trailing?: Snippet;
    /**
     * Нажатие на заголовок с подписью — как на лицо чата: к «О чате». Кнопка невидима для
     * скринридера и Tab: доступная кнопка для того же действия должна быть в `trailing`.
     */
    ontitle?: () => void;
  }
  let { leading, title, subtitle, trailing, ontitle }: Props = $props();
</script>

<header class="bar glass" data-titlebar>
  <div class="side">{#if leading}{@render leading()}{/if}</div>
  <div class="titles" class:pressable={!!ontitle}>
    <h1>{title}</h1>
    {#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
    <!-- Поверх заголовка, а не вокруг: `h1` внутри `<button>` — не HTML. -->
    {#if ontitle}<button type="button" class="title-press" aria-hidden="true" tabindex="-1" onclick={ontitle}></button>{/if}
  </div>
  <div class="side end">{#if trailing}{@render trailing()}{/if}</div>
</header>

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-close);
    min-height: var(--size-navigation-bar);
    padding: var(--space-tight) var(--space-close);
    /* Вырез и статус-бар телефона: viewport-fit=cover отдаёт нам весь экран. */
    padding-block-start: max(var(--space-tight), env(safe-area-inset-top));
    /* Вырез телефона — или кнопки окна, если шапка лежит в строке заголовка (titlebar.css,
       отступ раздаёт `Columns`). */
    padding-inline: max(var(--space-close), env(safe-area-inset-left), var(--bar-inset-start, 0px))
      max(var(--space-close), env(safe-area-inset-right), var(--bar-inset-end, 0px));
    border-block-end: var(--border-hairline) solid var(--color-separator);
  }
  h1 {
    margin: 0;
    font-size: var(--font-size-body);
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .titles {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  /* Нажимается текст, а не вся середина: за пустое место шапки в окне PWA таскают окно. */
  .pressable {
    justify-self: start;
    max-width: 100%;
  }
  .title-press {
    position: absolute;
    inset: 0;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }
  .subtitle {
    margin: 0;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .side {
    display: flex;
    gap: var(--space-tight);
  }
  .glass {
    background: var(--color-glass-opaque);
  }
  @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
    .glass {
      background: var(--color-glass);
      -webkit-backdrop-filter: saturate(180%) blur(var(--backdrop-blur));
      backdrop-filter: saturate(180%) blur(var(--backdrop-blur));
    }
  }
</style>
