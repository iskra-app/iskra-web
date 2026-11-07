<!--
  Окно с формой: нативный `<dialog>` с `showModal()` — фокус внутри, `Esc` и щелчок по подложке
  закрывают, фокус возвращается туда, откуда открыли. Крестик в шапке — у каждого окна.
  Содержимое и кнопки — у того, кто открыл.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';
  import { backdropClose } from './backdropClose';
  import { whenClosed } from './motion';

  interface Props {
    open: boolean;
    title: string;
    /** Подпись крестика: тексты — у того, кто открыл. */
    closeLabel: string;
    onclose: () => void;
    /**
     * Окно со страницами внутри («Новый чат» → «Новая комната»): стрелка у заголовка, и `Esc`
     * возвращает на прежнюю страницу, а не закрывает окно. Подпись — у того, кто открыл.
     */
    back?: { label: string; onclick: () => void };
    children: Snippet;
  }
  let { open, title, closeLabel, onclose, back, children }: Props = $props();

  const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

  let dialog: HTMLDialogElement | undefined = $state();
  const id = $props.id();
  /** Содержимое на месте, пока окно открыто и пока закрытое догорает (`whenClosed`). */
  let shown = $state(false);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      shown = true;
      dialog.showModal();
      focusContent(dialog);
    }
    if (!open && dialog.open) {
      dialog.close();
      return whenClosed(dialog, () => (shown = false));
    }
  });

  /** Шапка — первая в разметке, но начинать окно надо с содержимого: иначе поле формы не получит фокус. */
  function focusContent(node: HTMLDialogElement) {
    const heading = node.querySelector(':scope > .heading');
    if (!heading?.contains(document.activeElement)) return;
    [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].find((element) => !heading.contains(element))?.focus();
  }

  function oncancel(event: Event) {
    if (!back) return;
    event.preventDefault();
    back.onclick();
  }
</script>

<dialog bind:this={dialog} use:backdropClose={onclose} data-motion="pop" aria-labelledby="{id}-title" {onclose} {oncancel}>
  {#if open || shown}
    <div class="heading" class:paged={!!back}>
      {#if back}<IconButton label={back.label} onclick={back.onclick}><Icon name="back" /></IconButton>{/if}
      <h2 id="{id}-title">{title}</h2>
      <IconButton label={closeLabel} onclick={onclose}><Icon name="close" /></IconButton>
    </div>
    {@render children()}
  {/if}
</dialog>

<style>
  dialog {
    width: min(calc(100% - 2 * var(--space-roomy)), var(--size-sign-in-column));
    max-height: calc(100dvh - 2 * var(--space-roomy));
    padding: var(--space-generous);
    border: var(--border-hairline) solid var(--color-dialog-edge);
    border-radius: var(--radius-card);
    background: var(--color-background);
    color: var(--color-text);
    box-shadow: 0 var(--space-close) var(--space-generous) rgb(0 0 0 / 0.25);
    overflow-y: auto;
  }
  /* Колонка — у окна всегда, а не только открытого: закрывающееся ещё догорает (`display` с
     `allow-discrete` в `base.css`), `[open]` с него уже снят — и содержимое вставало в ряд. */
  dialog {
    flex-direction: column;
    gap: var(--space-normal);
  }
  dialog[open] {
    display: flex;
  }
  dialog::backdrop {
    background: var(--color-scrim);
  }
  h2 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: var(--font-size-title);
    overflow-wrap: anywhere;
  }
  /* Шапка не уезжает с длинным содержимым — крестик всегда под рукой. Кнопки крупнее строки
     заголовка: запас сверху уходит в отступ окна. */
  .heading {
    position: sticky;
    inset-block-start: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--space-tight);
    margin-block-start: calc(-1 * var(--space-close));
    margin-inline-end: calc(-1 * var(--space-close));
    background: var(--color-background);
  }
  /* Стрелка — на месте отступа окна: заголовок остаётся вровень с остальным. */
  .heading.paged {
    margin-inline-start: calc(-1 * var(--space-normal));
  }
</style>
