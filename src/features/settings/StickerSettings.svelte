<!--
  Стикеровая половина «Стикеров и реакций» — `StickerSettingsSections` нативной: какие наборы
  показывает панель, наборы, на которые подписан аккаунт, свои стикеры и недавние.

  Всё, кроме переключателей, — аккаунта: данные MSC2545, те же списки, что читают Element и
  Cinny. Убранный здесь стикер пропадает и там, и каждая перемена записывается сразу.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import Menu from '../../design/Menu.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import { viewport } from '../../design/viewport.svelte.ts';
  import type { Sticker } from '../../core/stickers/imagePack';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { plural, t } from '../../i18n/index.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import StickerImage from '../room/StickerImage.svelte';
  import { stickerArt, stickerSources } from '../room/stickers';

  let { session }: { session: UserSession } = $props();
  const library = $derived(session.stickers);

  $effect(() => {
    void library.load(null, stickerSources(), stickerArt);
  });

  const subscriptions = $derived(library.packs.filter((p) => p.origin.kind === 'room' && library.isSubscribed(p)));
  let menu = $state<{ sticker: Sticker; x: number; y: number } | null>(null);

  function ask(event: MouseEvent, sticker: Sticker) {
    event.preventDefault();
    menu = { sticker, x: event.clientX, y: event.clientY };
  }
</script>

<section aria-labelledby="sticker-sources-title">
  <h3 id="sticker-sources-title">{t('stickers.settings.sheetSection')}</h3>
  <label class="switch">
    <span>{t('stickers.settings.builtIn')}</span>
    <input type="checkbox" role="switch" bind:checked={preferences.stickersBuiltIn} />
  </label>
  <label class="switch">
    <span>{t('stickers.settings.mine')}</span>
    <input type="checkbox" role="switch" bind:checked={preferences.stickersMine} />
  </label>
  <label class="switch">
    <span>{t('stickers.settings.roomPacks')}</span>
    <input type="checkbox" role="switch" bind:checked={preferences.stickersRoomPack} />
  </label>
  <p class="secondary">{t('stickers.settings.roomPacksHelp')}</p>
</section>

{#if subscriptions.length}
  <section aria-labelledby="sticker-subscriptions-title">
    <h3 id="sticker-subscriptions-title">{t('stickers.settings.subscriptions')}</h3>
    <ul class="list">
      {#each subscriptions as pack (pack.id)}
        <li class="row">
          {#if pack.icon}<StickerImage sticker={pack.icon} media={session.media} size="tab" />{:else}<svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.emojiSmileys} /></svg>{/if}
          <span class="what">
            <span class="name">{pack.name ?? t('stickers.roomPack')}</span>
            <span class="secondary">{plural('stickers.settings.count', pack.stickers.length)}</span>
          </span>
          <PlainButton danger onclick={() => void library.unsubscribe(pack)}>{t('stickers.settings.unsubscribe')}</PlainButton>
        </li>
      {/each}
    </ul>
    <p class="secondary">{t('stickers.settings.subscriptionsHelpWeb')}</p>
  </section>
{/if}

<section aria-labelledby="sticker-mine-title">
  <h3 id="sticker-mine-title">{t('stickers.mine')}</h3>
  {#if library.mine?.stickers.length}
    <div class="grid" role="group" aria-labelledby="sticker-mine-title">
      {#each library.mine.stickers as sticker (sticker.url)}
        <button type="button" class="cell" aria-label={sticker.body} title={sticker.body} aria-haspopup="menu" onclick={(event) => ask(event, sticker)} oncontextmenu={(event) => ask(event, sticker)}>
          <StickerImage {sticker} media={session.media} size="cell" />
        </button>
      {/each}
    </div>
  {:else if library.loaded}
    <p class="secondary">{t('stickers.empty.message')}</p>
  {/if}
  <p class="secondary">{t('stickers.settings.mineHelp')}</p>
</section>

<section aria-labelledby="sticker-recent-title">
  <h3 id="sticker-recent-title" class="visually-hidden">{t('stickers.recent')}</h3>
  <PlainButton danger disabled={!library.recent.length} onclick={() => void library.clearRecent()}>{t('stickers.settings.clearRecent')}</PlainButton>
  <p class="secondary">{t('stickers.settings.clearRecentHelp')}</p>
  {#if library.failure}
    <p class="problem" role="alert">{t(`stickers.${library.failure}Failed`)}</p>
  {/if}
</section>

<Menu open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} sheet={!viewport.finePointer} label={menu?.sticker.body ?? ''} onclose={() => (menu = null)}>
  {#if menu}
    {@const sticker = menu.sticker}
    <button
      type="button"
      role="menuitem"
      class="danger"
      onclick={() => {
        menu = null;
        void library.remove(sticker);
      }}>{t('stickers.remove')}</button
    >
  {/if}
</Menu>

<style>
  /* Как у остальных групп «Настроек»: заголовок мелкими прописными, список карточкой. */
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
    margin-block-start: var(--space-generous);
  }
  section > :global(*) {
    flex-shrink: 0;
  }
  h3 {
    margin: var(--space-close) 0 0;
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
  }
  p {
    margin: 0;
  }
  .secondary {
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .problem {
    color: var(--color-danger);
    font-size: var(--font-size-caption);
  }
  .switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-normal);
    min-height: var(--tap-target);
    padding: var(--space-close) var(--space-normal);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    cursor: pointer;
  }
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    list-style: none;
  }
  .row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-normal);
    padding: var(--space-close) var(--space-normal);
  }
  .row + .row {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .row svg {
    width: var(--size-sticker-tab);
    height: var(--size-sticker-tab);
    fill: var(--color-text-secondary);
  }
  .what {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--size-sticker-cell), 1fr));
    gap: var(--space-close);
  }
  .cell {
    display: grid;
    place-items: center;
    padding: 0;
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    cursor: pointer;
  }
</style>
