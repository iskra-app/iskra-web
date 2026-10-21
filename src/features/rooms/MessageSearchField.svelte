<!--
  Поле «Поиск по сообщениям» — `RoomSearchField` нативной: лупа, поле и крестик, который
  появляется, когда есть что стирать. Крестик маленький на вид, но нажимается целиком —
  в него тычут не глядя.

  `Esc` в непустом поле стирает запрос, в пустом — не его дело: закрывает окно, в котором поле.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import { t } from '../../i18n/index.svelte.ts';

  let { value = $bindable(''), label = t('roomList.searchPrompt'), autofocus = false }: { value: string; label?: string; autofocus?: boolean } = $props();
  let input: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (autofocus) input?.focus();
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') input?.blur();
    if (event.key !== 'Escape' || !value) return;
    event.stopPropagation();
    event.preventDefault();
    value = '';
  }
</script>

<div class="field" role="search">
  <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.search} /></svg>
  <input bind:this={input} bind:value type="search" aria-label={label} placeholder={label} autocomplete="off" enterkeyhint="search" spellcheck="false" {onkeydown} />
  {#if value.trim()}
    <button
      type="button"
      aria-label={t('roomList.clearSearch')}
      title={t('roomList.clearSearch')}
      onclick={() => {
        value = '';
        input?.focus();
      }}
    >
      <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.close} /></svg>
    </button>
  {/if}
</div>

<style>
  .field {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    min-height: var(--tap-target);
    padding-inline: var(--space-normal) 0;
    border-radius: var(--radius-circle);
    background: var(--color-surface);
    color: var(--color-text-secondary);
  }
  .field:focus-within {
    outline: var(--border-thick) solid var(--color-focus);
  }
  input {
    flex: 1;
    min-width: 0;
    min-height: var(--tap-target);
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    outline: none;
  }
  /* Свой крестик — у браузера он у каждого разный и не нажимается пальцем. */
  input::-webkit-search-cancel-button {
    appearance: none;
  }
  svg {
    flex: none;
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
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
    color: var(--color-text-secondary);
    cursor: pointer;
  }
</style>
