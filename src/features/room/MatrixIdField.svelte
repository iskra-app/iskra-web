<!--
  «Matrix ID» — `MatrixIDField` нативной: подпись, сам ID цветом акцента (его можно выделить) и
  «Скопировать» рядом. Ради этой строки страницу человека чаще всего и открывают.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import { t } from '../../i18n/index.svelte.ts';

  let { userId }: { userId: string } = $props();
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(userId);
    } catch {
      return;
    }
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 1500);
  }

  $effect(() => () => clearTimeout(timer));
</script>

<div class="field">
  <span class="what">
    <span class="label">{t('profile.matrixID')}</span>
    <span class="id">{userId}</span>
  </span>
  <button type="button" aria-label={t('message.menu.copy')} title={t('message.menu.copy')} onclick={() => void copy()}>
    <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={copied ? icons.check : icons.copy} /></svg>
  </button>
</div>

<style>
  .field {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    padding: var(--space-close) var(--space-normal);
    border-radius: var(--radius-card);
    background: var(--color-surface);
  }
  .what {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .label {
    font-size: var(--font-size-caption);
  }
  .id {
    color: var(--accent);
    overflow-wrap: anywhere;
    user-select: text;
  }
  button {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--tap-target);
    height: var(--tap-target);
    padding: 0;
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: var(--accent);
    cursor: pointer;
  }
  svg {
    width: var(--size-icon-button);
    height: var(--size-icon-button);
    fill: currentColor;
  }
</style>
