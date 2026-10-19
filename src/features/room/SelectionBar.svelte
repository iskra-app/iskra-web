<!--
  Панель на месте композера, пока выбирают сообщения, — `MessageSelectionBar` нативной Искры:
  «Отмена», сколько выбрано и что можно сделать со всеми сразу. Капсула, как сам композер:
  панель со своими углами читалась бы как что-то, упавшее поверх переписки.

  Действие предлагается, только если оно применимо к *каждому* выбранному: удаление, которое
  тихо пропустило бы чужие слова, — удаление, которое врёт о том, что сделало.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import { plural, t } from '../../i18n/index.svelte.ts';

  interface Props {
    count: number;
    canCopy: boolean;
    canForward: boolean;
    canDelete: boolean;
    oncancel: () => void;
    oncopy: () => void;
    onforward: () => void;
    ondelete: () => void;
  }
  let { count, canCopy, canForward, canDelete, oncancel, oncopy, onforward, ondelete }: Props = $props();
</script>

<div class="selection glass" role="toolbar" aria-label={plural('message.selection.count', count)}>
  <button type="button" class="cancel" onclick={oncancel}>{t('message.selection.cancel')}</button>
  <span class="count" aria-live="polite">{plural('message.selection.count', count)}</span>
  <span class="actions">
    <button type="button" aria-label={t('message.menu.copy')} title={t('message.menu.copy')} disabled={!canCopy || count === 0} onclick={oncopy}>
      <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.copy} /></svg>
    </button>
    <button type="button" aria-label={t('message.menu.forward')} title={t('message.menu.forward')} disabled={!canForward || count === 0} onclick={onforward}>
      <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.forwardMessage} /></svg>
    </button>
    <button type="button" class="danger" aria-label={t('message.menu.delete')} title={t('message.menu.delete')} disabled={!canDelete || count === 0} onclick={ondelete}>
      <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.delete} /></svg>
    </button>
  </span>
</div>

<style>
  .selection {
    transition:
      opacity var(--timing-chrome) var(--ease-out),
      transform var(--timing-chrome) var(--ease-out);
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
    fill: currentColor;
  }
  /* На место композера — снизу, как он сам. */
  @starting-style {
    .selection {
      opacity: 0;
      transform: translateY(var(--motion-rise));
    }
  }
</style>
