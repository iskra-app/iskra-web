<!--
  «Подглядеть» — `ChatPeek` нативной: чат из списка, не заходя в него, — и потому никому не
  сказав, что прочитано. Своя лента над той же комнатой (`session.timeline`), заведённая на
  время карточки и закрытая с ней, с `reads={false}`: отметку о прочтении шлёт только экран
  чата, а это не он. «Открыть чат» — путь насквозь, и вот он уже читает, как всегда.

  Лента только для глаз: листается в историю, но ни меню, ни реакций, ни ответа — это делают
  в чате.
-->
<script module lang="ts">
  export interface PeekAction {
    label: string;
    icon: IconName;
    run: () => void;
  }
</script>

<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import type { IconName } from '../../design/icons.ts';
  import type { RoomSummary } from '../../core/rooms/types';
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
    onclose: () => void;
  }
  let { room, session, onclose }: Props = $props();

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
    store?.setShowsAllEvents(preferences.showsAllEvents);
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
    retry: noop,
    sendAnyway: noop,
    discard: noop,
    openMedia: noop,
    openMenu: noop,
    stickerIsMine: () => undefined,
    toggleSticker: noop,
    showsReactors: false,
    reactors: noop,
    report: noop,
  };
</script>

<Dialog closeLabel={t('roomList.peek.close')} open={!!room} title={current ? roomName(current) : ''} {onclose}>
  {#if current}
    <div class="card">
      {#if store}
        {#key store}
          <Timeline {store} {session} showSenders={current.kind !== 'direct'} actions={lookOnly} reads={false} />
        {/key}
      {/if}
    </div>
  {/if}
</Dialog>

<style>
  .card {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    height: min(var(--size-peek-height), var(--size-peek-fit));
    border-radius: var(--radius-card);
    background: var(--color-surface);
    overflow: hidden;
  }
</style>
