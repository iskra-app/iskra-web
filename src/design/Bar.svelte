<!-- Шапка колонки. Поверхность задаёт её контейнер. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    leading?: Snippet;
    leadingOnly?: boolean;
    seam?: boolean;
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
  let { leading, title, subtitle, trailing, ontitle, seam = true, leadingOnly = false }: Props = $props();
</script>

<header class="bar" class:seam class:leading-only={leadingOnly} data-titlebar>
  <div class="side">{#if leading}{@render leading()}{/if}</div>
  {#if !leadingOnly}
    <div class="titles" class:pressable={!!ontitle}>
      <h1>{title}</h1>
      {#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
      <!-- Поверх заголовка, а не вокруг: `h1` внутри `<button>` — не HTML. -->
      {#if ontitle}<button type="button" class="title-press" aria-hidden="true" tabindex="-1" onclick={ontitle}></button>{/if}
    </div>
    <div class="side end">{#if trailing}{@render trailing()}{/if}</div>
  {/if}
</header>

<style>
  .bar {
    background: var(--bar-surface, var(--color-background));
    position: sticky;
    top: 0;
    z-index: 1;
    /* В колонке под шапкой — длинная лента, и без этого шапка уступала бы ей по высоте. */
    flex: none;
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
    border-block-end: var(--border-hairline) solid transparent;
  }
  .bar.leading-only {
    grid-template-columns: minmax(0, 1fr);
  }
  .bar.leading-only .side {
    justify-content: center;
  }
  .bar.seam {
    border-block-end-color: var(--color-separator);
  }
  h1 {
    margin: 0;
    font-size: var(--font-size-body);
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* Плотнее обычного: заголовок с подписью должен уместиться в высоту кнопок шапки, иначе шапка
     чата выходит выше соседних колонок и черта под ними идёт ступенькой. */
  .titles {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: var(--line-height-bar);
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
</style>
