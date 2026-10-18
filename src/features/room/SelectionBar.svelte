<!--
  Панель на месте композера, пока выбирают сообщения, — `MessageSelectionBar` нативной Искры:
  «Отмена», сколько выбрано и что можно сделать со всеми сразу. Капсула, как сам композер:
  панель со своими углами читалась бы как что-то, упавшее поверх переписки.

  Действие предлагается, только если оно применимо к *каждому* выбранному: удаление, которое
  тихо пропустило бы чужие слова, — удаление, которое врёт о том, что сделало.
-->
<script lang="ts">
  import { plural, t } from '../../i18n/index.svelte.ts';

  interface Props {
    count: number;
    canCopy: boolean;
    canDelete: boolean;
    oncancel: () => void;
    oncopy: () => void;
    ondelete: () => void;
  }
  let { count, canCopy, canDelete, oncancel, oncopy, ondelete }: Props = $props();
</script>

<div class="selection glass" role="toolbar" aria-label={plural('message.selection.count', count)}>
  <button type="button" class="cancel" onclick={oncancel}>{t('message.selection.cancel')}</button>
  <span class="count" aria-live="polite">{plural('message.selection.count', count)}</span>
  <span class="actions">
    <button type="button" aria-label={t('message.menu.copy')} title={t('message.menu.copy')} disabled={!canCopy || count === 0} onclick={oncopy}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>
    </button>
    <button type="button" class="danger" aria-label={t('message.menu.delete')} title={t('message.menu.delete')} disabled={!canDelete || count === 0} onclick={ondelete}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
    </button>
  </span>
</div>

<style>
  .selection {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    min-height: var(--size-navigation-bar);
    margin: var(--space-close) var(--timeline-gutter);
    margin-block-end: max(var(--space-close), env(safe-area-inset-bottom));
    padding: 0 var(--space-generous);
    border-radius: var(--radius-circle);
  }
  button {
    border: none;
    background: transparent;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    color: var(--color-text-secondary);
    cursor: default;
  }
  .count {
    flex: 1;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .actions {
    display: flex;
    gap: var(--space-roomy);
  }
  .actions button {
    display: grid;
    place-items: center;
    min-width: var(--tap-target);
    min-height: var(--tap-target);
    padding: 0;
  }
  .actions .danger:not(:disabled) {
    color: var(--color-danger);
  }
  svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
