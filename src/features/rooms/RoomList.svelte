<!--
  Список чатов.

  Один список, как в нативной Искре, на любой ширине: приглашения сверху (на них надо
  ответить), под ними закреплённые, дальше всё по последней активности — пространства вместе
  с чатами. «Архив» — тихой строкой над списком, когда в нём что-то есть; пространство и
  архив открываются на месте списка со стрелкой «назад». Есть папки — над списком вкладки
  (`FolderTabs`), и папка показывает свои чаты в том же порядке.

  Стрелки ↑/↓ ходят по строкам, как в любом списке на десктопе.

  «Поиск по сообщениям» — не здесь: окном по лупе в шапке (`MessageSearchDialog`).
-->
<script lang="ts">
  import { tick } from 'svelte';
  import EmptyState from '../../design/EmptyState.svelte';
  import ConfirmDialog from '../../design/ConfirmDialog.svelte';
  import NewSignInBanner from './NewSignInBanner.svelte';
  import { NewSignIns } from '../../core/session/newSignIns.svelte.ts';
  import ProblemPanel from '../../design/ProblemPanel.svelte';
  import IconButton from '../../design/IconButton.svelte';
  import { router } from '../../core/navigation/router.svelte.ts';
  import type { RoomSummary } from '../../core/rooms/types';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import InviteRow from './InviteRow.svelte';
  import RoomRow from './RoomRow.svelte';
  import RoomFace from './RoomFace.svelte';
  import FolderTabs from './FolderTabs.svelte';
  import { folderSelection } from './folderSelection.svelte.ts';
  import { roomsOf } from '../../core/rooms/folders';
  import { roomName } from './text';
  import Icon from '../../design/Icon.svelte';
  import Menu from '../../design/Menu.svelte';
  import FolderMembership from './FolderMembership.svelte';
  import ChatPeek, { type PeekAction } from './ChatPeek.svelte';
  import { hasUnread } from '../../core/rooms/types';

  let { session, avatarOnly = false, onexpand }: {
    session: UserSession;
    avatarOnly?: boolean;
    onexpand?: () => void;
  } = $props();
  let list: HTMLDivElement | undefined = $state();

  type View = { kind: 'all' } | { kind: 'archive' } | { kind: 'space'; id: string };

  let view = $state<View>({ kind: 'all' });

  let failure = $state<TextKey | null>(null);
  $effect(() => {
    if (!failure) return;
    const timer = setTimeout(() => (failure = null), 8000);
    return () => clearTimeout(timer);
  });

  // Часы для меток «вчера» и дней недели: вкладка живёт днями, полночь наступает.
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(timer);
  });

  const selectedId = $derived(router.route.name === 'room' ? router.route.roomId : null);
  const organized = $derived(session.rooms.organized);

  const folders = $derived(session.folders.folders);
  /** Выбранная папка; удалили её (здесь или на другом устройстве) — снова «Все». */
  const folder = $derived(folders.find((f) => f.id === folderSelection.id));

  const shown = $derived(
    view.kind === 'archive'
      ? organized.archived
      : view.kind === 'space'
        ? session.rooms.childrenOf(view.id)
        : folder
          ? roomsOf(folder, organized.list, organized.archived)
          : organized.list,
  );

  export function visibleRooms(): RoomSummary[] {
    return shown.filter((room) => room.membership !== 'invite' && room.kind !== 'space');
  }

  export function focusRoom(id?: string | null): void {
    const row = id ? list?.querySelector<HTMLElement>(`[data-room-id="${CSS.escape(id)}"]`) : undefined;
    (row ?? list?.querySelector<HTMLElement>('[aria-current="page"]') ?? list?.querySelector<HTMLElement>('[data-room-id]'))?.focus();
  }

  const nothingAtAll = $derived(view.kind === 'all' && organized.list.length === 0 && organized.archived.length === 0);

  const viewTitle = $derived(
    view.kind === 'archive'
      ? t('roomList.archive.title')
      : view.kind === 'space'
        ? roomName(session.rooms.get(view.id) ?? ({ id: view.id } as RoomSummary))
        : '',
  );

  function open(room: RoomSummary) {
    if (room.kind === 'space') {
      view = { kind: 'space', id: room.id };
      return;
    }
    router.go({ name: 'room', roomId: room.id });
  }

  async function showInvite(id: string) {
    onexpand?.();
    await tick();
    list?.querySelector<HTMLElement>(`[data-invite-id="${CSS.escape(id)}"]`)?.focus();
  }

  // ————— Меню строки — то, что в нативной под «подглядыванием» —————

  let menu = $state<{ room: RoomSummary; at: { x: number; y: number }; sheet: boolean } | null>(null);
  let choosingFolders = $state<RoomSummary | null>(null);

  let peeking = $state<RoomSummary | null>(null);
  /**
   * Новые входы в аккаунт — при запуске и при каждом возвращении на вкладку: вход — то, что
   * случается, пока вкладка в фоне.
   */
  const signIns = $derived(new NewSignIns(session.userId, () => session.devices()));
  $effect(() => {
    const store = signIns;
    void store.check();
    const onvisible = () => document.visibilityState === 'visible' && void store.check();
    document.addEventListener('visibilitychange', onvisible);
    return () => document.removeEventListener('visibilitychange', onvisible);
  });

  /** Из какого чата выйти — ждёт ответа на вопрос. */
  let leaving = $state<RoomSummary | null>(null);

  async function leave(room: RoomSummary) {
    leaving = null;
    if (!(await session.rooms.leave(room.id))) failure = 'roomAction.leaveFailed';
    else if (selectedId === room.id) router.go({ name: 'home' });
  }

  /** Подглядеть: меню уступает место карточке. */
  function peekAt(room: RoomSummary) {
    menu = null;
    peeking = room;
  }

  /**
   * Что можно сделать со строкой — пункты «подглядывания» нативной, по порядку: под карточкой
   * и в меню одни и те же. Каждый закрывает то, откуда нажат; не вышло — сказать.
   */
  function rowActions(room: RoomSummary): PeekAction[] {
    const rooms = session.rooms;
    const act = (task: () => Promise<boolean> | void, failed?: TextKey) => () => {
      menu = null;
      peeking = null;
      const result = task();
      if (result && failed) void result.then((ok) => !ok && (failure = failed));
    };
    return [
      { icon: 'chats', label: t('roomList.peek.open'), run: act(() => open(room)) },
      hasUnread(room)
        ? { icon: 'check', label: t('roomList.peek.markRead'), run: act(() => rooms.markRead(room.id), 'roomAction.readFailed') }
        : { icon: 'bell', label: t('roomList.peek.markUnread'), run: act(() => rooms.markUnread(room.id), 'roomAction.readFailed') },
      {
        icon: 'pin',
        label: t(room.isFavourite ? 'roomList.swipe.unpin' : 'roomList.swipe.pin'),
        run: act(() => rooms.setPinned(room.id, !room.isFavourite), 'roomAction.pinFailed'),
      },
      ...(room.kind === 'space'
        ? []
        : [
            {
              icon: 'archive' as const,
              label: t(room.isLowPriority ? 'roomList.swipe.unarchive' : 'roomList.swipe.archive'),
              run: act(() => rooms.setArchived(room.id, !room.isLowPriority), 'roomAction.archiveFailed'),
            },
          ]),
      ...(folders.length > 0 ? [{ icon: 'folder' as const, label: t('folders.addToFolder'), run: act(() => void (choosingFolders = room)) }] : []),
      // Смахивание «Удалить» нативной: единственное, что не отменить, — поэтому сначала вопрос.
      { icon: 'delete', label: t('roomList.swipe.delete'), run: act(() => void (leaving = room)) },
    ];
  }

  /** ↑/↓ — по строкам списка. */
  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const rows = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-room-id]')];
    const index = rows.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    const next = rows[event.key === 'ArrowDown' ? index + 1 : index - 1];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }
</script>

{#if !avatarOnly && view.kind === 'all' && signIns.sessions[0]}
  {@const device = signIns.sessions[0]}
  <NewSignInBanner
    {device}
    more={signIns.sessions.length - 1}
    onconfirm={() => void signIns.confirm(device)}
    ondeny={() => router.go({ name: 'settings', section: 'devices' })}
  />
{/if}

{#if !avatarOnly && view.kind === 'all' && folders.length > 0}
  <FolderTabs {folders} list={organized.list} archived={organized.archived} selected={folder?.id ?? ''} onselect={(id) => (folderSelection.id = id)} />
{/if}

{#if avatarOnly}
  <div class="rail-archive">
    <IconButton label={t('roomList.archive.title')} pressed={view.kind === 'archive'} onclick={() => (view = { kind: view.kind === 'archive' ? 'all' : 'archive' })}>
      <Icon name="archive" />
    </IconButton>
  </div>
{/if}

{#if view.kind === 'space' || (!avatarOnly && view.kind === 'archive')}
  <div class="subheader" class:rail={avatarOnly}>
    <IconButton label={t('room.back')} onclick={() => (view = { kind: 'all' })}><Icon name="back" /></IconButton>
    <h2 class:visually-hidden={avatarOnly}>{viewTitle}</h2>
  </div>
{/if}

{#if failure}
  <div class="failure" class:visually-hidden={avatarOnly}>
    <ProblemPanel title={t('problem.title')} message={t(failure)} />
  </div>
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="list" class:avatar-only={avatarOnly} bind:this={list} {onkeydown}>
  {#if !session.ready && session.rooms.rooms.length === 0}
    <EmptyState title={t('roomList.loading')} />
  {:else if nothingAtAll}
    <EmptyState title={t('roomList.emptyTitle')} message={t('roomList.emptyMessage')} />
  {:else if view.kind === 'space' && shown.length === 0}
    <EmptyState title={t('room.spaceEmptyTitle')} message={t('room.spaceEmptyMessage')} />
  {:else if view.kind === 'archive' && shown.length === 0}
    <EmptyState title={t('roomList.archive.emptyTitle')} message={t('roomList.archive.emptyMessageWeb')} />
  {:else if folder && shown.length === 0}
    <EmptyState title={t('folders.emptyTitle')} message={t('folders.emptyMessage')} />
  {:else}
    {#if !avatarOnly && view.kind === 'all' && !folder && organized.archived.length > 0}
      <button type="button" class="archive" onclick={() => (view = { kind: 'archive' })}>
        <Icon name="archive" />
        <span>{t('roomList.archive.title')}</span>
      </button>
    {/if}
    {#each shown as room (room.id)}
      {#if room.membership === 'invite'}
        {#if avatarOnly}
          <button type="button" class="invite-avatar" title={roomName(room)} aria-label={`${roomName(room)}, ${t('roomList.invite.unattributed')}`} onclick={() => void showInvite(room.id)}>
            <RoomFace {room} {session} />
          </button>
        {:else}
          <InviteRow {room} {session} onfailure={(key) => (failure = key)} />
        {/if}
      {:else}
        <RoomRow
          {room}
          {session}
          {now}
          {avatarOnly}
          selected={room.id === selectedId}
          onopen={() => open(room)}
          onmenu={(at, sheet) => (menu = { room, at, sheet })}
        />
      {/if}
    {/each}
  {/if}
</div>

<Menu
  open={!!menu}
  x={menu?.at.x ?? 0}
  y={menu?.at.y ?? 0}
  sheet={menu?.sheet ?? false}
  label={t('roomList.menuWeb', { name: menu ? roomName(menu.room) : '' })}
  onclose={() => (menu = null)}
>
  {#if menu}
    {@const room = menu.room}
    {#if room.kind !== 'space'}
      <button type="button" role="menuitem" onclick={() => peekAt(room)}><Icon name="read" />{t('roomList.peek.peek')}</button>
    {/if}
    {#each rowActions(room) as action (action.label)}
      <button type="button" role="menuitem" onclick={action.run}><Icon name={action.icon} />{action.label}</button>
    {/each}
  {/if}
</Menu>

<ChatPeek room={peeking} {session} onclose={() => (peeking = null)} />

<ConfirmDialog closeLabel={t('recovery.close')}
  open={!!leaving}
  title={t('roomList.swipe.leaveConfirmTitle')}
  message={t('roomList.swipe.leaveConfirmMessage')}
  confirmLabel={t('roomList.swipe.leaveConfirm')}
  cancelLabel={t('roomList.swipe.cancel')}
  destructive
  onclose={() => (leaving = null)}
  onconfirm={() => leaving && void leave(leaving)}
/>

<FolderMembership room={choosingFolders} {session} onclose={() => (choosingFolders = null)} />

<style>
  .list {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-block-end: max(var(--space-close), env(safe-area-inset-bottom));
  }
  .rail-archive {
    display: grid;
    justify-items: center;
    padding-block: var(--space-tight);
  }
  .list.avatar-only {
    min-height: 0;
    overflow-x: hidden;
    scrollbar-width: none;
    padding-block-start: var(--space-tight);
  }
  .list.avatar-only > :global(.empty) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .subheader.rail {
    justify-content: center;
    padding-inline: 0;
  }
  .invite-avatar {
    display: grid;
    place-items: center;
    width: calc(100% - 2 * var(--space-tight));
    min-height: var(--row-room);
    margin-inline: var(--space-tight);
    padding: var(--space-close) var(--space-tight);
    border: none;
    border-radius: var(--radius-row);
    background: transparent;
    cursor: pointer;
  }
  @media (hover: hover) {
    .invite-avatar:hover {
      background: var(--color-incoming-bubble);
    }
  }
  .subheader {
    display: flex;
    align-items: center;
    gap: var(--space-tight);
    padding: var(--space-tight) var(--space-close);
  }
  .subheader h2 {
    margin: 0;
    font-size: var(--font-size-body);
    font-weight: 600;
  }
  /* Значок и «Архив», без числа — как `archiveEntry` нативной: архив — полка, а не счётчик. */
  .archive {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    width: calc(100% - 2 * var(--space-tight));
    min-height: var(--tap-target);
    margin: var(--space-close) var(--space-tight);
    padding: 0 var(--space-normal);
    border: none;
    border-radius: var(--radius-row);
    background: transparent;
    color: var(--color-text-secondary);
    font-weight: 500;
    text-align: start;
    cursor: pointer;
  }
  .archive :global(svg) {
    width: var(--size-icon);
    height: var(--size-icon);
  }
  /* Наведение — только там, где указатель умеет наводиться: на телефоне тап оставлял бы «залипшую» подсветку. */
  @media (hover: hover) {
    .archive:hover {
      background: var(--color-incoming-bubble);
    }
  }
  .failure {
    padding: var(--space-close);
  }
</style>
