<!--
  Окно с формой: нативный `<dialog>` с `showModal()` — фокус внутри, `Esc` закрывает,
  фокус возвращается туда, откуда открыли. Содержимое и кнопки — у того, кто открыл.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { whenClosed } from './motion';

  interface Props {
    open: boolean;
    title: string;
    onclose: () => void;
    children: Snippet;
  }
  let { open, title, onclose, children }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  const id = $props.id();
  /** Содержимое на месте, пока окно открыто и пока закрытое догорает (`whenClosed`). */
  let shown = $state(false);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      shown = true;
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
      return whenClosed(dialog, () => (shown = false));
    }
  });
</script>

<dialog bind:this={dialog} data-motion="pop" aria-labelledby="{id}-title" {onclose}>
  {#if open || shown}
    <h2 id="{id}-title">{title}</h2>
    {@render children()}
  {/if}
</dialog>

<style>
  dialog {
    width: min(calc(100% - 2 * var(--space-roomy)), var(--size-sign-in-column));
    max-height: calc(100dvh - 2 * var(--space-roomy));
    padding: var(--space-generous);
    border: none;
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
    margin: 0;
    font-size: var(--font-size-title);
  }
</style>
