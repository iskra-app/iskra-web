<!--
  «Подглядеть» — `ChatPeek` нативной: чат из списка, не заходя в него, — и потому никому не
  сказав, что прочитано. Своя лента над той же комнатой (`session.timeline`), заведённая на
  время карточки и закрытая с ней, с `reads={false}`: отметку о прочтении шлёт только экран
  чата, а это не он. «Открыть чат» — путь насквозь, и вот он уже читает, как всегда.

  Лента только для глаз: листается в историю, но ни меню, ни реакций, ни ответа — это делают
  в чате. Под ней — то, что можно сделать со строкой, те же пункты, что у её меню.
-->
<script module lang="ts">
  export interface PeekAction {
    label: string;
    run: () => void;
  }
</script>

<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import { hasUnread, type RoomSummary } from '../../core/rooms/types';
  import type { TimelineStore } from '../../core/timeline/timelineStore.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import type { MessageActions } from '../room/actions';
  import Timeline from '../room/Timeline.svelte';
  import { roomName } from './text';

  interface Props {
    /** Чат, в который подглядывают; `null` — карточки нет. */
    room: RoomSummary | null;
    session: UserSession;
    actions: readonly PeekAction[];
    onclose: () => void;
  }
  let { room, session, actions, onclose }: Props = $props();

  const roomId = $derived(room?.id ?? null);
  /** Живая сводка: отметили прочитанным из-под карточки — строка «только подглядываете» уходит. */
  const current = $derived(roomId ? (session.rooms.get(roomId) ?? room) : null);

  let store = $state<TimelineStore | null>(null);
  $effect(() => {
    if (!roomId) return;
    const created = session.timeline(roomId);
    store = created;
    return () => {
      created.destroy();
      if (store === created) store = null;
    };
  });
  $effect(() => {
    store?.setServiceHiding({ nameChanges: preferences.hideNameChanges, membership: preferences.hideMembershipChanges });
  });

  const noop = () => {};
  /** Только смотреть: всё, что лента умеет предложить, здесь не делает ничего. */
  const lookOnly: MessageActions = {
    canReply: false,
    canPin: false,
    reply: noop,
    edit: noop,
    react: noop,
    vote: noop,
    forward: noop,
    select: noop,
    endPoll: noop,
    pin: noop,
    unpin: noop,
    remove: noop,
    block: noop,
    retry: noop,
    discard: noop,
    openMedia: noop,
    openMenu: noop,
    showsReactors: false,
    reactors: noop,
    report: noop,
  };
</script>

<Dialog open={!!room} title={current ? roomName(current) : ''} {onclose}>
  {#if current}
    {#if hasUnread(current)}
      <p class="secondary">{t('roomList.peek.staysUnread')}</p>
    {/if}
    <div class="card">
      {#if store}
        {#key store}
          <Timeline {store} {session} showSenders={current.kind !== 'direct'} actions={lookOnly} reads={false} />
        {/key}
      {/if}
    </div>
    <ul class="actions">
      {#each actions as action (action.label)}
        <li><button type="button" onclick={action.run}>{action.label}</button></li>
      {/each}
      <li><button type="button" onclick={onclose}>{t('roomList.peek.close')}</button></li>
    </ul>
  {/if}
</Dialog>

<style>
  .secondary {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .card {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    height: min(var(--size-peek-height), var(--size-peek-fit));
    border-radius: var(--radius-card);
    background: var(--color-surface);
    overflow: hidden;
  }
  .actions {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    margin: 0;
    padding: 0;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    list-style: none;
    overflow: hidden;
  }
  .actions > * + * {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  button {
    width: 100%;
    min-height: var(--tap-target);
    padding: var(--space-tight) var(--space-normal);
    border: none;
    background: transparent;
    color: var(--accent);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
</style>
