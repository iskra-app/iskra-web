<!--
  Оболочка вошедшего человека: раскладка в три ширины, список чатов, горячие клавиши
  уровня приложения и число непрочитанных в заголовке вкладки. Лента — этап 4.
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { profileRequest } from '../room/profileRequest.svelte.ts';
  import Columns from '../../design/Columns.svelte';
  import { Lazy } from '../../design/lazy.svelte.ts';
  import Bar from '../../design/Bar.svelte';
  import Button from '../../design/ui/Button.svelte';
  import SparkGlyph from '../../design/SparkGlyph.svelte';
  import IconButton from '../../design/IconButton.svelte';
  import Icon from '../../design/Icon.svelte';
  import { viewport } from '../../design/viewport.svelte.ts';
  import ConfirmDialog from '../../design/ConfirmDialog.svelte';
  import { router } from '../../core/navigation/router.svelte.ts';
  import { parseRoute } from '../../core/navigation/route';
  import { app } from '../../core/session/app.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { i18n, plural, t } from '../../i18n/index.svelte.ts';
  import { typingText } from '../room/text';
  import { presenceLabel } from '../room/presenceLabel';
  import type { PresenceWatch } from '../../core/session/presence.svelte.ts';
  import { describeHotkey, match } from '../../design/hotkeys';
  import { hasUnread } from '../../core/rooms/types';
  import { preferences } from './preferences.svelte.ts';
  import OfflineStrip from './OfflineStrip.svelte';
  import StorageNotice from './StorageNotice.svelte';
  import { showBadge } from './badge.svelte.ts';
  import RoomList from '../rooms/RoomList.svelte';
  import RoomFace from '../rooms/RoomFace.svelte';
  import { roomName } from '../rooms/text';
  import RoomView from '../room/RoomView.svelte';
  import type { ReadingPosition } from '../room/Timeline.svelte';
  import HotkeyHelp from './HotkeyHelp.svelte';
  import OpenLinkDialog from './OpenLinkDialog.svelte';
  import { settingsParent, settingsTitles } from '../settings/sections';
  import LockedHistoryStrip from '../recovery/LockedHistoryStrip.svelte';
  import type { TimelineStore } from '../../core/timeline/timelineStore.svelte.ts';
  import { installOverlayHistory } from './overlayHistory';

  let { session }: { session: UserSession } = $props();
  let confirmingSignOut = $state(false);
  let searching = $state(false);
  let helping = $state(false);
  let creating = $state(false);
  let roomView: RoomView | undefined = $state();
  let roomTimeline: TimelineStore | undefined = $state();
  let roomList: RoomList | undefined = $state();
  let infoButton: HTMLButtonElement | undefined = $state();
  let searchButton: HTMLButtonElement | undefined = $state();
  let listToggle: HTMLButtonElement | undefined = $state();
  let searchTrigger: HTMLElement | undefined;
  let threadTrigger: HTMLElement | undefined;
  // Меняется при уходе из ленты. Данные нужны только следующему экземпляру ленты.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const readingPositions = new Map<string, ReadingPosition>();

  onMount(() => {
    const overlay = installOverlayHistory(() => !viewport.finePointer, closeInfo, () => void restoreFocus());
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reconcile = () => overlay.reconcile();
    pointer.addEventListener('change', reconcile);
    return () => {
      pointer.removeEventListener('change', reconcile);
      overlay.destroy();
    };
  });

  let panelOpen = $state(false);
  // Узкий экран: «О чате» — лист поверх чата, а не колонка рядом, и уходит вместе с чатом. Иначе
  // ушли системным «назад» или свайпом, минуя `closeRoom`, — и следующий чат открылся бы листом.
  // Раньше страницы человека ниже: та открывает панель уже в новом чате.
  let panelRoom: string | null = null;
  $effect(() => {
    const current = roomId;
    if (current === panelRoom) return;
    panelRoom = current;
    if (untrack(() => viewport.layout) !== 'three') panelOpen = false;
  });

  // Не каждому и не сразу — своими чанками, при первом показе (`design/lazy.svelte.ts`).
  const settingsScreen = new Lazy(() => import('../settings/Settings.svelte'));
  const roomPanel = new Lazy(() => import('../room/RoomPanel.svelte'));
  const messageSearch = new Lazy(() => import('../rooms/MessageSearchDialog.svelte'));
  const newChat = new Lazy(() => import('../rooms/NewChatDialog.svelte'));
  // Страница человека из ленты — в панели «О чате»: открыть её (и закрыть тред, если он на её месте).
  $effect(() => {
    const pending = profileRequest.pending;
    if (!pending || pending.roomId !== roomId) return;
    if (untrack(() => threadId)) closeThread();
    panelOpen = true;
  });
  const roomId = $derived(router.route.name === 'room' ? router.route.roomId : null);
  const desktopChat = $derived(viewport.layout !== 'stack' && viewport.finePointer);
  const hideList = $derived(desktopChat && preferences.listCollapsed);
  const Settings = $derived(settingsScreen.when(router.route.name === 'settings'));
  const RoomPanel = $derived(roomPanel.when(panelOpen && roomId !== null));
  const MessageSearchDialog = $derived(messageSearch.when(searching));
  const NewChatDialog = $derived(newChat.when(creating));
  $effect(() => {
    if (!session.ready || !viewport.finePointer) return;
    const preload = () => {
      void messageSearch.preload();
      void roomPanel.preload();
      void settingsScreen.preload();
    };
    if ('requestIdleCallback' in window) {
      const idle = window.requestIdleCallback(preload);
      return () => window.cancelIdleCallback(idle);
    }
    const timer = setTimeout(preload, 500);
    return () => clearTimeout(timer);
  });
  /** Открытый тред — на месте «О чате»: справа на широком экране, листом поверх чата на узком. */
  const threadId = $derived(router.route.name === 'room' ? router.route.thread : undefined);
  function closeThread() {
    if (!roomId) return;
    router.backTo({ name: 'room', roomId });
  }
  let threadRoom: string | null = null;
  $effect(() => {
    if (threadId) threadRoom = roomId;
    else if (threadRoom) {
      if (threadRoom === roomId && !untrack(() => panelOpen)) void restoreFocus(threadTrigger ?? untrack(() => infoButton));
      threadRoom = null;
      threadTrigger = undefined;
    }
  });
  const room = $derived(roomId ? session.rooms.get(roomId) : undefined);
  // Чат, которого нет в списке (чужая ссылка, ещё не синхронизирован), — показываем ID.
  const title = $derived(room ? roomName(room) : (roomId ?? ''));

  /**
   * Что сейчас со связью — вместо «Чаты» над списком и первым под именем чата, как
   * `RoomListStatus` нативной. `undefined` — всё в порядке.
   */
  const status = $derived(
    session.connection === 'offline' ? t('roomList.waitingForNetwork') : session.connection === 'connecting' ? t('roomList.updating') : undefined,
  );
  /**
   * Где собеседник личного чата — пока чат открыт. Скрыл своё время захода — не спрашиваем и о
   * чужом: подглядывать, прячась, — то сочетание, которое переключатель исключает.
   */
  let presence = $state<PresenceWatch | null>(null);
  const counterpart = $derived(room?.kind === 'direct' && !preferences.hidePresence ? room.counterpartId : undefined);
  $effect(() => {
    if (!counterpart) return;
    const watch = session.presence(counterpart);
    presence = watch;
    return () => {
      watch.destroy();
      if (presence === watch) presence = null;
    };
  });
  // Сказать серверу при входе и при каждом щелчке переключателя.
  $effect(() => {
    void session.applyPresence(preferences.hidePresence);
  });

  /**
   * Строка под именем чата — `headerSubtitle` нативной: связь, потом кто печатает, потом кто
   * это — ID собеседника в личном чате, число участников в группе.
   */
  const subtitle = $derived.by(() => {
    if (status) return status;
    const typing = roomTimeline?.roomId === roomId ? roomTimeline?.typing ?? [] : [];
    if (typing.length) return room?.kind === 'direct' ? t('room.typing') : typingText(typing);
    if (!room) return undefined;
    if (room.kind === 'direct') return (presence?.presence && presenceLabel(presence.presence, Date.now(), i18n.locale)) || room.counterpartId;
    return room.memberCount > 0 ? plural('room.members', room.memberCount) : undefined;
  });

  /**
   * Чужая ссылка (`#/open/…`) — когда сессия готова: раньше список чатов ещё не знает, где мы
   * уже состоим. Свой чат с человеком и своя комната открываются сразу; остальное — вопросом.
   */
  let link = $state<{ target: string; via?: string[] | undefined } | null>(null);
  let askingLink = $state(false);
  $effect(() => {
    const route = router.route;
    // Ушли со ссылки сами («назад», другой чат) — и вопрос уходит.
    if (route.name !== 'open') askingLink = false;
    if (route.name !== 'open' || !session.ready) return;
    untrack(() => {
      const existing = session.existingRoomFor(route.target);
      if (route.target === session.userId) router.replace({ name: 'home' });
      else if (existing) router.replace({ name: 'room', roomId: existing });
      else {
        link = { target: route.target, via: route.via };
        askingLink = true;
      }
    });
  });

  /** Открыли чат или отказались. Окно закрывается и событием `close` — второй раз ничего не делаем. */
  function closeLink(roomId?: string) {
    if (!askingLink) return;
    askingLink = false;
    router.replace(roomId ? { name: 'room', roomId } : { name: 'home' });
  }

  $effect(() => {
    showBadge(session.rooms.badge, t('app.name'));
  });
  $effect(() => () => showBadge(0, t('app.name')));

  function step(direction: 1 | -1, onlyUnread: boolean) {
    const order = roomList?.visibleRooms() ?? [];
    const at = order.findIndex((r) => r.id === roomId);
    for (let i = at < 0 ? (direction === 1 ? 0 : order.length - 1) : at + direction; i >= 0 && i < order.length; i += direction) {
      const candidate = order[i]!;
      if (!onlyUnread || hasUnread(candidate) || candidate.mentionCount > 0) {
        router.go({ name: 'room', roomId: candidate.id });
        return;
      }
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || document.querySelector('dialog[open]')) return;
    const action = match(event);
    if (!action) return;
    switch (action) {
      case 'search':
        openSearch(document.activeElement instanceof HTMLElement ? document.activeElement : searchButton);
        break;
      case 'previousChat':
        step(-1, false);
        break;
      case 'nextChat':
        step(1, false);
        break;
      case 'previousUnread':
        step(-1, true);
        break;
      case 'nextUnread':
        step(1, true);
        break;
      case 'help':
        helping = true;
        break;
      case 'settings':
        router.go({ name: 'settings' });
        break;
      case 'escape':
        if (threadId) closeThread();
        else if (panelOpen) closeInfo();
        else if (roomId) {
          if (!roomView?.escape()) closeRoom();
        } else if (router.route.name === 'settings') settingsBack();
        else return;
        break;
      case 'attach':
        if (!roomId) return;
        roomView?.attach();
        break;
      case 'pageUp':
      case 'pageDown':
        if (!roomId) return;
        roomView?.page(action === 'pageUp' ? -1 : 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  /** ⓘ, лицо чата и имя в шапке: «О чате» — открыть (вместо треда) или закрыть. */
  function toggleInfo() {
    if (threadId) {
      closeThread();
      panelOpen = true;
    } else if (panelOpen) closeInfo();
    else panelOpen = true;
  }

  async function restoreFocus(target?: HTMLElement, fallbackRoom = roomId) {
    await tick();
    if (document.querySelector('dialog[open]')) return;
    if (target?.isConnected && target.getClientRects().length && !target.closest('[inert]')) target.focus({ preventScroll: true });
    else if (hideList) listToggle?.focus({ preventScroll: true });
    else roomList?.focusRoom(fallbackRoom);
  }

  function closeInfo() {
    panelOpen = false;
    void restoreFocus(infoButton);
  }

  function openSearch(trigger?: HTMLElement) {
    searchTrigger = trigger;
    searching = true;
  }

  function closeSearch() {
    if (!searching) return;
    const active = document.activeElement;
    const trigger = searchTrigger ?? searchButton;
    searching = false;
    // При выборе результата новую ленту и фокус определяет открывшийся чат.
    void tick().then(() => {
      if (document.activeElement === document.body || document.activeElement === active) void restoreFocus(trigger);
    });
  }

  function closeRoom() {
    const previous = roomId;
    panelOpen = false;
    router.backTo({ name: 'home' });
    if (viewport.layout !== 'stack') void restoreFocus(undefined, previous);
  }

  /** Раздел настроек на экране; `undefined` — список разделов или не настройки. */
  const settingsSection = $derived(router.route.name === 'settings' ? router.route.section : undefined);
  /**
   * «Назад» в настройках — и кнопкой в шапке, и `Esc`: из раздела — к тому, откуда он открыт, из
   * списка — к чатам. От адреса, а не от `router.route`: пока смена экрана анимируется, маршрут ещё
   * прежний, и второй `Esc` подряд вёл бы туда же, где уже стоим.
   */
  function settingsBack() {
    const current = parseRoute(window.location.hash);
    const settingsSection = current.name === 'settings' ? current.section : undefined;
    if (settingsSection) router.backTo({ name: 'settings', section: settingsParent[settingsSection] });
    else router.backTo({ name: 'home' });
  }
</script>

<!--
  Лицо чата в шапке — рядом с именем, на любой ширине. Нажимаются и оно, и имя с подписью (к
  «О чате»), но кнопка для этого одна — ⓘ справа: лицо и имя скринридеру не показываем, чтобы
  «О чате» не было тремя одинаковыми кнопками подряд, и в Tab их нет.
-->
{#snippet searchAction()}
  <IconButton bind:element={searchButton} label={t('roomList.searchPrompt')} shortcut={describeHotkey('search')} onclick={() => openSearch(searchButton)}>
    <Icon name="search" />
  </IconButton>
{/snippet}

{#snippet composeAction()}
  <IconButton label={t('roomList.newConversation')} onclick={() => (creating = true)}><Icon name="compose" /></IconButton>
{/snippet}

{#snippet settingsAction()}
  <IconButton label={t('account.settings')} shortcut={describeHotkey('settings')} onclick={() => router.go({ name: 'settings' })}>
    <Icon name="settings" />
  </IconButton>
{/snippet}

{#snippet face()}
  {#if room}
    <button type="button" class="room-face" aria-hidden="true" tabindex="-1" onclick={toggleInfo}>
      <RoomFace {room} {session} />
    </button>
  {/if}
{/snippet}

<Columns
  bind:listWidth={preferences.listWidth}
  {hideList}
  showMain={roomId !== null || router.route.name === 'settings'}
  panelOpen={(panelOpen || !!threadId) && roomId !== null}
  backLayer={panelOpen && !threadId}
  panelLabel={t(threadId ? 'thread.title' : 'room.info')}
  onClosePanel={() => (threadId ? closeThread() : closeInfo())}
  resizeLabel={t('layout.resizeList')}
>
  {#snippet list()}
    <div class="list-column" class:desktop={desktopChat}>
      <Bar title={status ?? t('roomList.title')} seam={!desktopChat} leadingOnly={hideList}>
        {#snippet leading()}
          {#if desktopChat}
            <IconButton
              bind:element={listToggle}
              label={t(hideList ? 'layout.showList' : 'layout.hideList')}
              expanded={!hideList}
              onclick={() => (preferences.listCollapsed = !preferences.listCollapsed)}
            >
              <span class="sidebar-spark"><SparkGlyph /></span>
              <span class="sidebar-toggle"><Icon name={hideList ? 'sidebarOpen' : 'sidebarClose'} /></span>
            </IconButton>
          {/if}
        {/snippet}
        {#snippet trailing()}
          {#if !desktopChat}{@render searchAction()}{/if}
          {@render composeAction()}
          {@render settingsAction()}
        {/snippet}
      </Bar>
      <div class="list-content">
        {#if hideList}
          <div class="rail-actions">
            {@render composeAction()}
            {@render settingsAction()}
            {@render searchAction()}
          </div>
        {:else}
          {#if desktopChat}
            <div class="search-launcher">
              <Button variant="ghost" size="wide" bind:element={searchButton} onclick={() => openSearch(searchButton)}>
                <Icon name="search" />
                <span class="search-label">{t('roomList.searchPrompt')}</span>
                <kbd aria-hidden="true">{describeHotkey('search')}</kbd>
              </Button>
            </div>
          {/if}
          <OfflineStrip {session} />
          <StorageNotice />
          <LockedHistoryStrip recovery={session.recovery} onopen={() => app.openRecovery()} />
        {/if}
        <RoomList bind:this={roomList} {session} avatarOnly={hideList} onexpand={() => (preferences.listCollapsed = false)} />
      </div>
    </div>
  {/snippet}

  {#snippet main()}
    {#if roomId}
      <div class="main-column">
      <Bar {title} {subtitle} seam={!desktopChat} ontitle={toggleInfo}>
        {#snippet leading()}
          {#if viewport.layout === 'stack'}
            <IconButton label={t('room.back')} onclick={closeRoom}><Icon name="back" /></IconButton>
          {/if}
          {@render face()}
        {/snippet}
        {#snippet trailing()}
          <IconButton bind:element={infoButton} label={t('room.info')} pressed={panelOpen && !threadId} onclick={toggleInfo}>
            <Icon name="info" />
          </IconButton>
        {/snippet}
      </Bar>
      {#key roomId}
        {@const id = roomId}
        <div class="conversation" class:stack={viewport.layout === 'stack'} class:desktop-chat={desktopChat}>
          <RoomView bind:this={roomView} bind:store={roomTimeline} {session} roomId={id} position={readingPositions.get(id)} onposition={(position) => readingPositions.set(id, position)}
            onthreadopen={() => (threadTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined)} />
        </div>
      {/key}
      </div>
    {:else if router.route.name === 'settings'}
      <div class="main-column">
        <Bar title={t(settingsSection ? settingsTitles[settingsSection] : 'settings.title')}>
          {#snippet leading()}
            <!-- Из раздела — к списку разделов; из списка — к чатам, если они не рядом. -->
            {#if settingsSection}
              <IconButton label={t('settings.back')} onclick={settingsBack}><Icon name="back" /></IconButton>
            {:else if viewport.layout === 'stack'}
              <IconButton label={t('settings.back')} onclick={settingsBack}><Icon name="back" /></IconButton>
            {/if}
          {/snippet}
          {#snippet trailing()}
            <!-- Карандаш, как в нативной: единственное на экране, что ваше, а не приложения. -->
            {#if !settingsSection}
              <IconButton label={t('account.edit')} onclick={() => router.go({ name: 'settings', section: 'profile' })}><Icon name="compose" /></IconButton>
            {/if}
          {/snippet}
        </Bar>
        {#if Settings}<Settings {session} section={router.route.section} />{:else}<p class="pane-status" role="status">{t('app.loading')}</p>{/if}
      </div>
    {:else}
      <!-- Чат не выбран — не надпись-инструкция, а искра: видна, но ничего не просит. Для
           скринридера — те же слова, что были на экране. -->
      <div class="watermark">
        <span class="visually-hidden">{t('room.noRoomSelectedTitle')}</span>
        <span class="spark"><SparkGlyph blinks /></span>
      </div>
    {/if}
  {/snippet}

  {#snippet panel()}
    {#if roomId && threadId}
      <div class="panel-column">
        <Bar title={t('thread.title')} subtitle={title}>
          {#snippet trailing()}
            <IconButton label={t('thread.close')} onclick={closeThread}><Icon name="close" /></IconButton>
          {/snippet}
        </Bar>
        {#key `${roomId} ${threadId}`}
          {@const id = `${roomId}#${threadId}`}
          <RoomView {session} {roomId} thread={threadId} position={readingPositions.get(id)} onposition={(position) => readingPositions.set(id, position)} />
        {/key}
      </div>
    {:else}
    <div class="panel-column">
      <Bar title={t('room.info')}>
        {#snippet trailing()}
          <IconButton label={t('room.infoClose')} onclick={closeInfo}><Icon name="close" /></IconButton>
        {/snippet}
      </Bar>
      {#if roomId && RoomPanel}
        {#key roomId}
          <RoomPanel
            {session}
            {roomId}
            timeline={roomTimeline?.roomId === roomId ? roomTimeline : undefined}
            onjump={(eventId) => {
              // На узком экране лист закрывает ленту — к сообщению можно только закрыв его.
              if (viewport.layout !== 'three') panelOpen = false;
              roomView?.reveal(eventId);
            }}
          />
        {/key}
      {:else}
        <p class="pane-status" role="status">{t('app.loading')}</p>
      {/if}
    </div>
    {/if}
  {/snippet}
</Columns>

<svelte:window {onkeydown} />

{#if MessageSearchDialog}<MessageSearchDialog {session} open={searching} onclose={closeSearch} />{/if}
<HotkeyHelp open={helping} onclose={() => (helping = false)} />
{#if NewChatDialog}<NewChatDialog open={creating} {session} onclose={() => (creating = false)} />{/if}
{#if link}
  <OpenLinkDialog open={askingLink} {session} target={link.target} via={link.via} onopen={closeLink} onclose={() => closeLink()} />
{/if}

<ConfirmDialog closeLabel={t('recovery.close')}
  open={confirmingSignOut}
  title={t('signOut.confirmTitle')}
  message={t('signOut.confirmMessage')}
  confirmLabel={t('account.signOut')}
  cancelLabel={t('common.cancel')}
  destructive
  onclose={() => (confirmingSignOut = false)}
  onconfirm={() => {
    confirmingSignOut = false;
    void app.signOut();
  }}
/>

<style>
  .room-face {
    display: inline-grid;
    place-items: center;
    min-width: var(--tap-target);
    min-height: var(--tap-target);
    padding: 0;
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    cursor: pointer;
    --size-room-avatar: var(--size-avatar-toolbar);
  }
  @media (hover: hover) {
    .room-face:hover {
      background: var(--color-incoming-bubble);
    }
  }
  .main-column {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .conversation {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }
  @media (prefers-reduced-motion: no-preference) {
    .conversation:not(.stack) {
      animation: conversation-in var(--timing-conversation) var(--ease-out);
    }
  }
  @keyframes conversation-in {
    from { opacity: var(--motion-conversation-opacity); }
  }
  .pane-status {
    display: grid;
    place-items: center;
    flex: 1;
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
.panel-column {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .panel-column > :global(:last-child) {
    flex: 1;
    min-height: 0;
  }
    .list-column {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .list-content {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
  }
  .rail-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-tight);
    padding-block-start: var(--space-tight);
  }
  .sidebar-spark {
    display: flex;
    color: var(--ui-link);
  }
  .sidebar-spark :global(svg),
  .sidebar-toggle :global(svg) {
    width: var(--size-icon);
    height: var(--size-icon);
  }
  .sidebar-toggle,
  :global(button:is(:hover, :focus-visible)) .sidebar-spark {
    display: none;
  }
  :global(button:is(:hover, :focus-visible)) .sidebar-toggle {
    display: flex;
  }
  .list-column.desktop :global(header) {
    padding-inline-start: max(var(--space-close), var(--bar-inset-start));
  }
  .search-launcher {
    padding: var(--space-tight) var(--space-normal) var(--space-close);
  }
  .search-launcher :global(button) {
    justify-content: flex-start;
    min-height: var(--tap-target);
    padding-inline: var(--space-close);
    border: var(--border-hairline) solid var(--color-separator);
    background: var(--color-background);
    text-align: start;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    font-weight: 500;
  }
  .search-launcher :global(svg) {
    width: var(--size-icon);
    height: var(--size-icon);
    flex: none;
  }
  .search-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  kbd {
    margin-inline-start: auto;
    font: inherit;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .desktop-chat {
    --column-timeline-max: 45rem;
    --timeline-gutter: var(--space-generous);
  }
  .watermark {
    display: grid;
    place-items: center;
    height: 100%;
  }
  .spark {
    width: var(--size-watermark);
    color: var(--color-watermark);
  }
</style>
