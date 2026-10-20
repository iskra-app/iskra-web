<!--
  «Старая переписка заблокирована» — над списком чатов, пока это устройство не открыло
  резервную копию. Отложил шаг восстановления — плашка помнит за него.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import type { RecoveryStore } from '../../core/encryption/recovery.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';

  let { recovery, onopen }: { recovery: RecoveryStore | null; onopen: () => void } = $props();
</script>

{#if recovery?.protection === 'keyNeeded'}
  <button type="button" class="locked" onclick={onopen}>
    <svg viewBox={ICON_VIEWBOX} aria-hidden="true">
      <path d={icons.lock} />
    </svg>
    <span>{t('recovery.banner.locked')}</span>
  </button>
{/if}

<style>
  .locked {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    width: 100%;
    min-height: var(--tap-target);
    padding: var(--space-close) var(--space-normal);
    border: none;
    background: var(--color-incoming-bubble);
    color: var(--accent);
    font-size: var(--font-size-caption);
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }
  svg {
    flex: none;
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
</style>
