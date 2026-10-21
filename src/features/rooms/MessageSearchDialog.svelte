<!--
  «Поиск по сообщениям» — лупа над списком и `Ctrl/⌘ K`: поле и найденное во всех чатах,
  отправитель, чат и отрывок. Нажатие закрывает окно и ведёт к сообщению.

  Тот же индекс на устройстве, что и у «Поиска в чате», только без чата в условии.
-->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import EmptyState from '../../design/EmptyState.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import { revealRequest } from '../app/revealRequest.svelte.ts';
  import MessageSearchField from './MessageSearchField.svelte';
  import SearchHits from './SearchHits.svelte';
  import { roomName } from './text';

  interface Props {
    open: boolean;
    session: UserSession;
    onclose: () => void;
  }
  let { open, session, onclose }: Props = $props();

  let query = $state('');
  const search = $derived(session.search);
  $effect(() => {
    if (!open) return;
    return () => (query = '');
  });
  $effect(() => search.search(open ? query : ''));

  function chatOf(roomId: string): string | undefined {
    const room = session.rooms.rooms.find((r) => r.id === roomId);
    return room && roomName(room);
  }
</script>

<Dialog {open} title={t('roomList.searchPrompt')} {onclose}>
  <MessageSearchField bind:value={query} autofocus />
  <div class="results">
    {#if !search.hits.length && !search.foundNothing && !search.searching}
      <EmptyState title={t('roomList.searchPrompt')} />
    {:else}
      <SearchHits
        hits={search.hits}
        foundNothing={search.foundNothing}
        {chatOf}
        onopen={(hit) => {
          onclose();
          revealRequest.open(hit.roomId, hit.id);
        }}
      />
    {/if}
  </div>
  <PlainButton onclick={onclose}>{t('room.searchClose')}</PlainButton>
</Dialog>

<style>
  .results {
    min-height: var(--size-search-results);
    max-height: var(--size-search-results);
    margin-block: var(--space-close);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
</style>
