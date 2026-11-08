<!--
  Подтверждение необратимого. Нативный `<dialog>` с `showModal()`: он сам ловит фокус,
  возвращает его, когда закрыт, и закрывается по `Esc`.
-->
<script lang="ts">
  import { closingGhost } from './closingGhost.svelte.ts';
  import DialogClose from './DialogClose.svelte';
  import { backdropClose } from './backdropClose';
  interface Props {
    open: boolean;
    title: string;
    message: string;
    /** Перечень того, о чём спрашиваем, — под текстом, по строке на пункт. */
    details?: string[];
    confirmLabel: string;
    cancelLabel: string;
    /** Подпись крестика. */
    closeLabel: string;
    /** Действие разрушительное: кнопка подтверждения — красная, а не акцентная. */
    destructive?: boolean;
    onconfirm: () => void;
    onclose: () => void;
  }
  let { open, title, message, details = [], confirmLabel, cancelLabel, closeLabel, destructive = false, onconfirm, onclose }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  const id = $props.id();
  let live: HTMLDivElement | undefined = $state();
  let ghost: HTMLDivElement | undefined = $state();
  closingGhost(() => open, () => live, () => ghost);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} use:backdropClose={onclose} data-motion="pop" aria-labelledby="{id}-title" aria-describedby="{id}-message" {onclose}>
  <div class="live" bind:this={live}>
    <h2 id="{id}-title">{title}</h2>
    <p id="{id}-message">{message}</p>
    {#if details.length}
      <ul class="details">
        {#each details as line, index (index)}<li>{line}</li>{/each}
      </ul>
    {/if}
    <div class="actions">
      <!-- Ни одна из двух не выделена как «правильная»: фокус — на отмене. -->
      <button type="button" class="cancel press" onclick={onclose}>{cancelLabel}</button>
      <button type="button" class="confirm press" class:destructive onclick={onconfirm}>{confirmLabel}</button>
    </div>
  </div>
  <div class="live" aria-hidden="true" inert hidden bind:this={ghost}></div>
  <DialogClose label={closeLabel} onclick={onclose} />
</dialog>

<style>
  dialog {
    width: min(calc(100% - 2 * var(--space-roomy)), var(--size-sign-in-column));
    padding: var(--space-generous);
    border: var(--border-hairline) solid var(--color-dialog-edge);
    border-radius: var(--radius-menu);
    background: var(--color-background);
    color: var(--color-text);
    box-shadow: 0 var(--space-close) var(--space-generous) rgb(0 0 0 / 0.25);
  }
  .live {
    display: contents;
  }
  .live[hidden] {
    display: none;
  }
  dialog::backdrop {
    background: var(--color-scrim);
  }
  h2 {
    margin: 0 0 var(--space-close);
    padding-inline-end: var(--tap-target);
    font-size: var(--font-size-title);
  }
  p {
    margin: 0 0 var(--space-generous);
    color: var(--color-text-secondary);
  }
  .details {
    margin: calc(-1 * var(--space-close)) 0 var(--space-generous);
    padding-inline-start: var(--space-roomy);
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-close);
  }
  button {
    min-height: var(--tap-target);
    padding: 0 var(--space-roomy);
    border: none;
    border-radius: var(--radius-circle);
    font-weight: 600;
    cursor: pointer;
  }
  .cancel {
    background: var(--color-incoming-bubble);
  }
  .confirm {
    background: var(--accent);
    color: var(--on-accent);
  }
  .confirm.destructive {
    background: var(--color-danger);
    color: var(--color-on-danger);
  }
</style>
