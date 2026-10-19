<!--
  Полоса «у собеседника новые ключи» — `IdentityChangeBanner` нативной. По одному человеку за
  раз, старший первым: ответили про одного — появляется следующий. Стопка таких полос — стена
  предупреждений, которую никто не читает, а каждая из них — вопрос про одного человека.

  Серьёзный случай — ключи сменились после проверки — подкрашен, чтобы два случая нельзя было
  спутать с одного взгляда. И кнопка у него не «Понятно»: она что-то меняет — снимает проверку.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import type { IdentityChange } from '../../core/encryption/identityChanges.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';

  interface Props {
    change: IdentityChange;
    onacknowledge: () => void;
  }
  let { change, onacknowledge }: Props = $props();

  const serious = $derived(change.kind === 'afterVerification');
</script>

<div class="identity" class:serious role="status">
  <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={serious ? icons.warning : icons.shield} /></svg>
  <div class="what">
    <strong>{t(serious ? 'room.identity.violationTitle' : 'room.identity.changedTitle', { name: change.name })}</strong>
    <p>{t(serious ? 'room.identity.violationBody' : 'room.identity.changedBody')}</p>
    <button type="button" onclick={onacknowledge}>{t(serious ? 'room.identity.withdraw' : 'room.identity.understood')}</button>
  </div>
</div>

<style>
  .identity {
    --tint: var(--accent);
    display: flex;
    align-items: flex-start;
    gap: var(--space-close);
    padding: var(--space-roomy) var(--timeline-gutter);
    border-block-end: var(--border-hairline) solid var(--color-separator);
    background: var(--color-glass-opaque);
  }
  .serious {
    --tint: var(--color-warning);
    background: color-mix(in srgb, var(--color-warning) var(--warning-wash), var(--color-background));
  }
  svg {
    flex: none;
    width: var(--size-icon);
    height: var(--size-icon);
    fill: var(--color-text-secondary);
  }
  .serious svg {
    fill: var(--color-warning);
  }
  .what {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-tight);
    min-width: 0;
  }
  p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  button {
    margin-block-start: var(--space-tight);
    padding: var(--space-tight) var(--space-normal);
    border: none;
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--tint) var(--warning-wash), transparent);
    color: var(--tint);
    font: inherit;
    font-size: var(--font-size-caption);
    font-weight: 600;
    cursor: pointer;
  }
</style>
