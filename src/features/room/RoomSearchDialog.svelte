<!--
  «Поиск в чате» — `RoomSearchView` нативной: поле и найденное в этом чате, отправитель,
  когда и отрывок. Нажатие закрывает окно и ведёт к сообщению — тем же переходом, что у
  закреплённого.

  Тот же индекс на устройстве, что и у поиска над списком, только с чатом в условии.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Dialog from '../../design/Dialog.svelte';
  import EmptyState from '../../design/EmptyState.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import type { MessageSearch } from '../../core/search/messageSearch.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import MessageSearchField from '../rooms/MessageSearchField.svelte';
  import SearchHits from '../rooms/SearchHits.svelte';

  interface Props {
    open: boolean;
    session: UserSession;
    roomId: string;
    onclose: () => void;
    onopen: (eventId: string) => void;
  }
  let { open, session, roomId, onclose, onopen }: Props = $props();

  let query = $state('');
  let search = $state<MessageSearch>();
  $effect(() => {
    if (!open) return;
    const id = roomId;
    const store = untrack(() => session.roomSearch(id));
    search = store;
    return () => {
      store.destroy();
      query = '';
    };
  });
  $effect(() => search?.search(query));
</script>

<Dialog {open} title={t('room.searchInChat')} {onclose}>
  <MessageSearchField bind:value={query} label={t('room.searchPrompt')} autofocus />
  <div class="results">
    {#if search}
      {#if !search.hits.length && !search.foundNothing && !search.searching}
        <EmptyState title={t('room.searchInChat')} />
      {:else}
        <SearchHits hits={search.hits} foundNothing={search.foundNothing} withTime onopen={(hit) => onopen(hit.id)} />
      {/if}
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
