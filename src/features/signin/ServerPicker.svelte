<!--
  «Не знаете, какой сервер выбрать?» — `ServerPickerView` нативной Искры: несколько публичных
  серверов и последним — свой. Выбор заполняет поле и закрывает окно; «Далее» остаётся за
  человеком.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import Dialog from '../../design/Dialog.svelte';
  import QuietButton from '../../design/QuietButton.svelte';
  import { t } from '../../i18n/index.svelte.ts';
  import { OWN_SERVER_GUIDE, publicServers } from './servers';

  let { open, onpick, onclose }: { open: boolean; onpick: (address: string) => void; onclose: () => void } = $props();

  const servers = publicServers(typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]));
</script>

<Dialog {open} title={t('servers.title')} {onclose}>
  <p class="secondary">{t('servers.intro')}</p>
  <ul>
    {#each servers as server (server.address)}
      <li>
        <button type="button" class="card" onclick={() => onpick(server.address)}>
          <span class="text">
            <strong>{server.address}</strong>
            <span class="secondary small">{t(server.whereabouts)}</span>
            <span class="about">{t(server.about)}</span>
            {#if server.warning}
              <span class="warning small">{t(server.warning)}</span>
            {/if}
          </span>
          <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.forward} /></svg>
        </button>
      </li>
    {/each}
    <li>
      <a class="card" href={OWN_SERVER_GUIDE} target="_blank" rel="noopener noreferrer">
        <span class="text">
          <strong>{t('servers.ownTitle')}</strong>
          <span class="about">{t('servers.ownAbout')}</span>
        </span>
        <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.external} /></svg>
      </a>
    </li>
  </ul>
  <QuietButton onclick={onclose}>{t('recovery.close')}</QuietButton>
</Dialog>

<style>
  ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .card {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    width: 100%;
    padding: var(--space-roomy);
    border: none;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }
  @media (hover: hover) {
    .card:hover {
      background: var(--color-selected);
    }
  }
  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-tight);
  }
  .about {
    padding-block-start: var(--space-tight);
  }
  .secondary {
    margin: 0;
    color: var(--color-text-secondary);
  }
  .small {
    font-size: var(--font-size-caption);
  }
  .warning {
    padding-block-start: var(--space-tight);
    color: var(--color-warning);
    font-weight: 500;
  }
  svg {
    flex: none;
    width: var(--space-roomy);
    height: var(--space-roomy);
    color: var(--color-text-secondary);
  }
</style>
