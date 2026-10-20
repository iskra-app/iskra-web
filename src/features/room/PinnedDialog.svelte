<!--
  «Закреплённые» — `PinnedMessagesView` нативной, по шеврону на полосе закреплённого: всё, что
  закреплено, новое сверху. В группе — лицо, имя, день и месяц, текст до трёх строк; в личном
  лица нет, различать некого. Нажатие ведёт к сообщению, «Открепить» — тем, у кого есть право
  (в нативной — смахиванием строки).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Avatar from '../../design/Avatar.svelte';
  import Dialog from '../../design/Dialog.svelte';
  import EmptyState from '../../design/EmptyState.svelte';
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import PlainButton from '../../design/PlainButton.svelte';
  import type { RoomDetailsStore } from '../../core/rooms/roomDetails.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import { previewText } from '../rooms/text';
  import { preferences } from '../app/preferences.svelte.ts';

  interface Props {
    open: boolean;
    session: UserSession;
    roomId: string;
    direct: boolean;
    canUnpin: boolean;
    onjump: (eventId: string) => void;
    onunpin: (eventId: string) => void;
    onclose: () => void;
  }
  let { open, session, roomId, direct, canUnpin, onjump, onunpin, onclose }: Props = $props();

  let details = $state<RoomDetailsStore>();
  $effect(() => {
    if (!open) return;
    const id = roomId;
    const store = untrack(() => session.roomDetails(id));
    details = store;
    return () => store.destroy();
  });

  const day = (ts: number) => new Intl.DateTimeFormat(i18n.locale, { day: 'numeric', month: 'short' }).format(ts);
</script>

<Dialog {open} title={t('room.pinnedTitle')} {onclose}>
  {#if details && details.pinned.length === 0}
    <EmptyState title={t('room.pinnedEmpty')} />
  {:else if details}
    <ul>
      {#each details.pinned as pin (pin.eventId)}
        <li>
          <button type="button" class="row" disabled={pin.unavailable} onclick={() => onjump(pin.eventId)}>
            {#if !direct && pin.senderId}
              <span class="face"><Avatar name={pin.senderName ?? pin.senderId} seed={pin.senderId} mode={preferences.faces} /></span>
            {/if}
            <span class="what">
              <span class="top">
                <strong>{pin.senderName ?? ''}</strong>
                {#if pin.ts}<time>{day(pin.ts)}</time>{/if}
              </span>
              <span class="text">{pin.unavailable ? t('reply.unavailable') : previewText(pin.preview) || '…'}</span>
            </span>
          </button>
          {#if canUnpin}
            <button type="button" class="unpin" aria-label={t('room.unpin')} title={t('room.unpin')} onclick={() => onunpin(pin.eventId)}>
              <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.close} /></svg>
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <PlainButton onclick={onclose}>{t('room.searchClose')}</PlainButton>
</Dialog>

<style>
  ul {
    max-height: var(--size-search-results);
    margin: 0 0 var(--space-close);
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  li {
    display: flex;
    align-items: flex-start;
  }
  li + li {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .row {
    display: flex;
    flex: 1;
    align-items: flex-start;
    gap: var(--space-normal);
    min-width: 0;
    padding: var(--space-close) var(--space-tight);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .row:disabled {
    cursor: default;
  }
  .face {
    flex: none;
    --avatar-size: var(--size-avatar-small);
  }
  .what {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-tight);
    min-width: 0;
  }
  .top {
    display: flex;
    align-items: baseline;
    gap: var(--space-close);
  }
  strong {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  time {
    flex: none;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .text {
    display: -webkit-box;
    overflow: hidden;
    color: var(--color-text-secondary);
    overflow-wrap: anywhere;
    white-space: pre-line;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }
  .unpin {
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
  svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
</style>
