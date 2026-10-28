<!--
  «Поиск по сообщениям» — лупа над списком и `Ctrl/⌘ K`: поле и найденное во всех чатах.
  Строка — как в списке чатов: лицо чата, его название, под ним отправитель и отрывок.
  Нажатие закрывает окно и ведёт к сообщению.

  Вид — бывшего быстрого перехода: окно без заголовка, поле сверху, список под ним.
  ↑/↓ — по найденному, `Enter` — открыть. `Esc` в непустом поле стирает запрос, в пустом —
  закрывает окно.

  Тот же индекс на устройстве, что и у «Поиска в чате», только без чата в условии.
-->
<script lang="ts">
  import type { SearchHit } from '../../core/search/messageSearch.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { backdropClose } from '../../design/backdropClose';
  import { t } from '../../i18n/index.svelte.ts';
  import { revealRequest } from '../app/revealRequest.svelte.ts';
  import RoomFace from './RoomFace.svelte';
  import { roomName } from './text';

  interface Props {
    open: boolean;
    session: UserSession;
    onclose: () => void;
  }
  let { open, session, onclose }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  let input: HTMLInputElement | undefined = $state();
  let query = $state('');
  let active = $state(0);
  const id = $props.id();

  const search = $derived(session.search);
  const hits = $derived(search.hits);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      query = '';
      active = 0;
      dialog.showModal();
      input?.focus();
    }
    if (!open && dialog.open) dialog.close();
  });

  $effect(() => search.search(open ? query : ''));

  $effect(() => {
    void hits;
    active = 0;
  });

  function roomOf(roomId: string) {
    return session.rooms.rooms.find((r) => r.id === roomId);
  }

  function choose(hit: SearchHit | undefined) {
    if (!hit) return;
    onclose();
    revealRequest.open(hit.roomId, hit.id);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = Math.max(0, Math.min(hits.length - 1, active + step));
      document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(hits[active]);
    } else if (event.key === 'Escape' && query) {
      event.preventDefault();
      event.stopPropagation();
      query = '';
    }
  }
</script>

<dialog bind:this={dialog} use:backdropClose={onclose} data-motion="pop" class="switcher" aria-label={t('roomList.searchPrompt')} {onclose}>
  <input
    bind:this={input}
    bind:value={query}
    type="text"
    role="combobox"
    aria-expanded={hits.length > 0}
    aria-controls="{id}-results"
    aria-activedescendant={hits.length ? `${id}-option-${active}` : undefined}
    aria-label={t('roomList.searchPrompt')}
    placeholder={t('roomList.searchPrompt')}
    autocomplete="off"
    enterkeyhint="search"
    spellcheck="false"
    {onkeydown}
  />
  {#if hits.length || search.foundNothing}
    <ul id="{id}-results" role="listbox" aria-label={t('roomList.searchPrompt')}>
      {#each hits as hit, index (hit.id)}
        {@const room = roomOf(hit.roomId)}
        <li
          id="{id}-option-{index}"
          role="option"
          aria-selected={index === active}
          onclick={() => choose(hit)}
          onkeydown={() => {}}
          onpointermove={() => (active = index)}
        >
          {#if room}<RoomFace {room} {session} />{/if}
          <span class="text">
            {#if room}<span class="name">{roomName(room)}</span>{/if}
            <span class="preview"><span class="sender">{hit.senderName}</span> {hit.excerpt}</span>
          </span>
        </li>
      {:else}
        <li class="empty" role="presentation">{t('room.searchEmptyTitle')}</li>
      {/each}
    </ul>
  {/if}
</dialog>

<style>
  .switcher {
    width: min(calc(100% - 2 * var(--space-roomy)), var(--column-timeline-max));
    max-height: min(70vh, 40rem);
    margin-block-start: 12vh;
    padding: 0;
    border: var(--border-hairline) solid var(--color-dialog-edge);
    border-radius: var(--radius-card);
    background: var(--color-background);
    color: var(--color-text);
    box-shadow: 0 var(--space-close) var(--space-generous) rgb(0 0 0 / 0.3);
    overflow: hidden;
  }
  /* Колонка — и у догорающего после закрытия окна (см. `Dialog`). */
  .switcher {
    flex-direction: column;
  }
  .switcher[open] {
    display: flex;
  }
  .switcher::backdrop {
    background: var(--color-scrim);
  }
  input {
    min-height: var(--size-navigation-bar);
    margin: var(--space-close);
    padding: 0 var(--space-roomy);
    border: none;
    border-radius: var(--radius-control);
    background: var(--color-incoming-bubble);
    font-size: var(--font-size-body);
  }
  input:focus-visible {
    outline: var(--border-thick) solid var(--accent);
    outline-offset: 0;
  }
  ul {
    margin: 0;
    padding: 0 var(--space-close) var(--space-close);
    list-style: none;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  li {
    --size-room-avatar: var(--size-avatar-toolbar);
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    padding: var(--space-tight) var(--space-close);
    border-radius: var(--radius-control);
    cursor: pointer;
  }
  li[aria-selected='true'] {
    background: var(--color-selected);
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .preview {
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .sender {
    color: var(--color-text);
  }
  .empty {
    justify-content: center;
    padding: var(--space-generous);
    color: var(--color-text-secondary);
    cursor: default;
  }
</style>
