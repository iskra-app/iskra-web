<!--
  Найденные сообщения — строки `searchResults` нативной Искры: отправитель жирно, под ним
  отрывок в две строки. В поиске по чату — ещё и когда, справа от имени (`RoomSearchView`):
  там чат и так понятен, а вопрос — «где в нём». В поиске по всем — на том же месте чат:
  вопрос «где», только шире.

  Пусто после поиска — «Ничего не нашлось»; до первого — то, что скажет тот, кто показывает.
-->
<script lang="ts">
  import type { SearchHit } from '../../core/search/messageSearch.svelte.ts';
  import EmptyState from '../../design/EmptyState.svelte';
  import { roomTimestamp } from '../../design/time';
  import { i18n, t } from '../../i18n/index.svelte.ts';

  interface Props {
    hits: readonly SearchHit[];
    foundNothing: boolean;
    /** Время справа от имени — в поиске по одному чату. */
    withTime?: boolean;
    /** Название чата справа от имени — в поиске по всем чатам. */
    chatOf?: (roomId: string) => string | undefined;
    onopen: (hit: SearchHit) => void;
  }
  let { hits, foundNothing, withTime = false, chatOf, onopen }: Props = $props();

  const now = Date.now();
</script>

{#if foundNothing}
  <EmptyState title={t('room.searchEmptyTitle')} />
{:else if hits.length}
  <ul>
    {#each hits as hit (hit.id)}
      <li>
        <button type="button" onclick={() => onopen(hit)}>
          <span class="top">
            <strong>{hit.senderName}</strong>
            {#if withTime}<time>{roomTimestamp(hit.timestamp, now, i18n.locale, t('room.yesterday'))}</time>{/if}
            {#if chatOf?.(hit.roomId)}<span class="chat">{chatOf(hit.roomId)}</span>{/if}
          </span>
          <span class="excerpt">{hit.excerpt}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li + li {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  button {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    width: 100%;
    padding: var(--space-close) var(--space-normal);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  @media (hover: hover) {
    button:hover {
      background: var(--color-incoming-bubble);
    }
  }
  .top {
    display: flex;
    align-items: baseline;
    gap: var(--space-close);
    min-width: 0;
  }
  strong {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chat {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 50%;
    overflow: hidden;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  time {
    flex: none;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .excerpt {
    display: -webkit-box;
    overflow: hidden;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    overflow-wrap: anywhere;
    white-space: pre-line;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
</style>
