<!--
  Список чатов.

  Один список, как в нативной Искре, на любой ширине: приглашения сверху (на них надо
  ответить), под ними закреплённые, дальше всё по последней активности — пространства вместе
  с чатами. «Архив» — тихой строкой над списком, когда в нём что-то есть; пространство и
  архив открываются на месте списка со стрелкой «назад». Есть папки — над списком вкладки
  (`FolderTabs`), и папка показывает свои чаты в том же порядке.

  Стрелки ↑/↓ ходят по строкам, как в любом списке на десктопе.
-->
<script lang="ts">
  import EmptyState from '../../design/EmptyState.svelte';
  import ProblemPanel from '../../design/ProblemPanel.svelte';
  import IconButton from '../../design/IconButton.svelte';
  import Icon from '../../design/Icon.svelte';
  import { router } from '../../core/navigation/router.svelte.ts';
  import type { RoomSummary } from '../../core/rooms/types';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import InviteRow from './InviteRow.svelte';
  import RoomRow from './RoomRow.svelte';
  import FolderTabs from './FolderTabs.svelte';
  import { folderSelection } from './folderSelection.svelte.ts';
  import { roomsOf } from '../../core/rooms/folders';
  import { roomName } from './text';
  import Menu from '../../design/Menu.svelte';
  import FolderMembership from './FolderMembership.svelte';
  import ChatPeek, { type PeekAction } from './ChatPeek.svelte';
  import { hasUnread } from '../../core/rooms/types';

  let { session }: { session: UserSession } = $props();

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

  // ————— Меню строки — то, что в нативной под «подглядыванием» —————

  let menu = $state<{ room: RoomSummary; at: { x: number; y: number }; sheet: boolean } | null>(null);
  let choosingFolders = $state<RoomSummary | null>(null);

  let peeking = $state<RoomSummary | null>(null);

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
      { label: t('roomList.peek.open'), run: act(() => open(room)) },
      hasUnread(room)
        ? { label: t('roomList.peek.markRead'), run: act(() => rooms.markRead(room.id), 'roomAction.readFailed') }
        : { label: t('roomList.peek.markUnread'), run: act(() => rooms.markUnread(room.id), 'roomAction.readFailed') },
      {
        label: t(room.isFavourite ? 'roomList.swipe.unpin' : 'roomList.swipe.pin'),
        run: act(() => rooms.setPinned(room.id, !room.isFavourite), 'roomAction.pinFailed'),
      },
      ...(room.kind === 'space'
        ? []
        : [
            {
              label: t(room.isLowPriority ? 'roomList.swipe.unarchive' : 'roomList.swipe.archive'),
              run: act(() => rooms.setArchived(room.id, !room.isLowPriority), 'roomAction.archiveFailed'),
            },
          ]),
      ...(folders.length > 0 ? [{ label: t('folders.addToFolder'), run: act(() => void (choosingFolders = room)) }] : []),
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

{#if view.kind === 'all' && folders.length > 0}
  <FolderTabs {folders} list={organized.list} archived={organized.archived} selected={folder?.id ?? ''} onselect={(id) => (folderSelection.id = id)} />
{/if}

{#if view.kind !== 'all'}
  <div class="subheader">
    <IconButton label={t('room.back')} onclick={() => (view = { kind: 'all' })}><Icon name="back" /></IconButton>
    <h2>{viewTitle}</h2>
  </div>
{/if}

{#if failure}
  <div class="failure">
    <ProblemPanel title={t('problem.title')} message={t(failure)} />
  </div>
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="list" {onkeydown}>
  {#if !session.ready && session.rooms.rooms.length === 0}
    <EmptyState title={t('roomList.loading')} />
  {:else if nothingAtAll}
    <EmptyState title={t('roomList.emptyTitle')} message={t('roomList.emptyMessage')} />
  {:else if view.kind === 'space' && shown.length === 0}
    <EmptyState title={t('room.spaceEmptyTitle')} />
  {:else if folder && shown.length === 0}
    <EmptyState title={t('folders.emptyTitle')} message={t('folders.emptyMessage')} />
  {:else}
    {#if view.kind === 'all' && !folder && organized.archived.length > 0}
      <button type="button" class="archive" onclick={() => (view = { kind: 'archive' })}>
        <Icon name="archive" />
        <span>{t('roomList.archive.title')}</span>
      </button>
    {/if}
    {#each shown as room (room.id)}
      {#if room.membership === 'invite'}
        <InviteRow {room} {session} onfailure={(key) => (failure = key)} />
      {:else}
        <RoomRow
          {room}
          {session}
          {now}
          selected={room.id === selectedId}
          onopen={() => open(room)}
          onmenu={(at, sheet) => (sheet && room.kind !== 'space' ? (peeking = room) : (menu = { room, at, sheet }))}
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
      <button type="button" role="menuitem" onclick={() => peekAt(room)}>{t('roomList.peek.peek')}</button>
    {/if}
    {#each rowActions(room) as action (action.label)}
      <button type="button" role="menuitem" onclick={action.run}>{action.label}</button>
    {/each}
  {/if}
</Menu>

<ChatPeek room={peeking} {session} actions={peeking ? rowActions(peeking) : []} onclose={() => (peeking = null)} />

<FolderMembership room={choosingFolders} {session} onclose={() => (choosingFolders = null)} />

<style>
  .list {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-block-end: max(var(--space-close), env(safe-area-inset-bottom));
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
    border-radius: var(--radius-control);
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
