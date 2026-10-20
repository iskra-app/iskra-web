<!--
  «Новый чат» — `NewChatView` нативной Искры, как у Telegram: поиск людей наверху, под ним три
  пути в комнату, ниже — все, с кем уже есть личный чат, по буквам. Без «Сканировать QR-код»:
  в браузере его некому держать перед чужим телефоном.

  Поиск идёт в два места: по своим чатам — сразу, по каталогу сервера — мгновение спустя. Matrix
  ID, набранный целиком, — всегда кто-то, кому можно написать: сервер перечисляет только тех,
  кого сам решил показать.

  Страницы — внутри окна: «Новая комната», «Публичные комнаты», «Присоединиться по адресу».
  Стрелка у заголовка и `Esc` ведут к списку, а не закрывают окно. Любой выход из окна — комната,
  которую открыть.
-->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import Icon from '../../design/Icon.svelte';
  import type { IconName } from '../../design/icons.ts';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import { router } from '../../core/navigation/router.svelte.ts';
  import { isMatrixId } from '../../core/rooms/create';
  import type { Person, PublicRoom, PublicRoomDirectory } from '../../core/rooms/directory.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { plural, t, type TextKey } from '../../i18n/index.svelte.ts';
  import PersonRow from './PersonRow.svelte';
  import { byLetter, contactsOf, matching } from './contacts';

  let { open, session, onclose }: { open: boolean; session: UserSession; onclose: () => void } = $props();

  type Page = 'home' | 'newRoom' | 'publicRooms' | 'joinByAddress';
  let page = $state<Page>('home');

  const titles: Record<Page, TextKey> = {
    home: 'roomList.newChat',
    newRoom: 'roomList.newRoom',
    publicRooms: 'roomList.new.publicRooms',
    joinByAddress: 'roomList.new.joinByAddress',
  };
  const actions: Array<{ page: Page; title: TextKey; icon: IconName }> = [
    { page: 'newRoom', title: 'roomList.new.createRoom', icon: 'people' },
    { page: 'publicRooms', title: 'roomList.new.publicRooms', icon: 'publicRooms' },
    { page: 'joinByAddress', title: 'roomList.new.joinByAddress', icon: 'link' },
  ];

  // ————— Список и поиск людей —————

  let query = $state('');
  let found = $state<Person[]>([]);
  let searching = $state(false);
  let searchFailed = $state(false);
  /** Чей чат открывается или создаётся — его строка говорит об этом, другие ждут. */
  let opening = $state<string | null>(null);
  let failure = $state<TextKey | null>(null);

  // Новое открытие — с начала.
  $effect(() => {
    if (!open) return;
    page = 'home';
    query = '';
    failure = null;
    opening = null;
    name = '';
    topic = '';
    isOpen = false;
    address = '';
    roomsQuery = '';
    directory = null;
  });

  const contacts = $derived(contactsOf([...session.rooms.organized.list, ...session.rooms.organized.archived]));
  const letters = $derived(byLetter(contacts));
  const term = $derived(query.trim());
  const known = $derived(matching(contacts, term));
  const strangers = $derived(found.filter((person) => !known.some((c) => c.id === person.id)));
  const typedId = $derived(isMatrixId(term) && term !== session.userId ? term : null);
  const writeToTyped = $derived(typedId !== null && !known.some((c) => c.id === typedId) && !strangers.some((p) => p.id === typedId));

  // Каталог — мгновение после того, как перестали печатать; ответ на прежний запрос не показываем.
  $effect(() => {
    const asked = term;
    searchFailed = false;
    if (!asked) {
      found = [];
      searching = false;
      return;
    }
    searching = true;
    let cancelled = false;
    const timer = setTimeout(() => {
      session.searchPeople(asked).then(
        (people) => {
          if (cancelled) return;
          found = people;
          searching = false;
        },
        () => {
          if (cancelled) return;
          found = [];
          searchFailed = true;
          searching = false;
        },
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  function show(roomId: string) {
    onclose();
    router.go({ name: 'room', roomId });
  }

  async function write(userId: string) {
    if (opening) return;
    opening = userId;
    failure = null;
    try {
      show(await session.createDirect(userId));
    } catch {
      failure = 'roomAction.createFailed';
    } finally {
      opening = null;
    }
  }

  // ————— Новая комната —————

  let name = $state('');
  let topic = $state('');
  let isOpen = $state(false);
  let creating = $state(false);

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (!name.trim() || creating) return;
    creating = true;
    failure = null;
    try {
      show(await session.createGroup(name, isOpen, topic));
    } catch {
      failure = 'roomAction.createFailed';
    } finally {
      creating = false;
    }
  }

  // ————— Публичные комнаты —————

  let roomsQuery = $state('');
  let directory = $state<PublicRoomDirectory | null>(null);
  let joining = $state<string | null>(null);

  // Каталог — с открытием страницы; набранное — мгновение спустя.
  $effect(() => {
    if (!open || page !== 'publicRooms') return;
    const asked = roomsQuery.trim();
    const current = (directory ??= session.publicRooms());
    const timer = setTimeout(() => void current.search(asked), asked ? 300 : 0);
    return () => clearTimeout(timer);
  });

  const joinedIds = $derived(
    new Set([...session.rooms.organized.list, ...session.rooms.organized.archived].filter((r) => r.membership === 'join').map((r) => r.id)),
  );

  function roomDetails(room: PublicRoom): string {
    return [room.alias, plural('room.members', room.memberCount), room.isOpen ? undefined : t('roomList.new.inviteOnly')].filter(Boolean).join(' · ');
  }

  async function enter(room: PublicRoom) {
    if (joinedIds.has(room.id)) return show(room.id);
    if (joining) return;
    joining = room.id;
    failure = null;
    try {
      show(await session.joinRoom(room.id));
    } catch {
      failure = 'roomAction.joinFailed';
    } finally {
      joining = null;
    }
  }

  /** Последняя строка видна — следующая страница каталога. */
  function more(node: HTMLElement) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void directory?.loadMore();
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  // ————— По адресу —————

  let address = $state('');
  let joiningAddress = $state(false);

  async function joinAddress(event: SubmitEvent) {
    event.preventDefault();
    const typed = address.trim();
    if (!typed || joiningAddress) return;
    failure = null;
    if (!/^[#!][^:\s]+:\S+$/.test(typed)) {
      failure = 'roomAction.joinAddressInvalid';
      return;
    }
    joiningAddress = true;
    try {
      show(await session.joinRoom(typed));
    } catch {
      failure = 'roomAction.joinFailed';
    } finally {
      joiningAddress = false;
    }
  }

  function go(next: Page) {
    failure = null;
    page = next;
  }
</script>

{#snippet publicRoomRow(room: PublicRoom)}
  <PersonRow
    {session}
    name={room.title}
    subtitle={roomDetails(room)}
    detail={room.topic}
    seed={room.id}
    avatarUrl={room.avatarUrl}
    busy={joining === room.id}
    disabled={(!room.isOpen && !joinedIds.has(room.id)) || joining !== null}
    onclick={() => void enter(room)}
  />
{/snippet}

<Dialog {open} title={t(titles[page])} {onclose} back={page === 'home' ? undefined : { label: t('settings.back'), onclick: () => go('home') }}>
  {#if page === 'home'}
    <TextField bind:value={query} label={t('roomList.new.searchPrompt')} placeholder={t('roomList.new.searchPrompt')} autocomplete="off" autofocus />
    <div class="list" aria-busy={opening !== null}>
      {#if !term}
        <ul class="rows">
          {#each actions as action (action.page)}
            <li>
              <button type="button" class="action" onclick={() => go(action.page)}>
                <span class="action-icon"><Icon name={action.icon} /></span>
                <span>{t(action.title)}</span>
              </button>
            </li>
          {/each}
        </ul>
        {#each letters as group (group.letter)}
          <section aria-label={group.letter}>
            <h3>{group.letter}</h3>
            <ul class="rows">
              {#each group.people as contact (contact.id)}
                <li>
                  <PersonRow {session} name={contact.name} subtitle={contact.id} seed={contact.id} avatarUrl={contact.avatarUrl} onclick={() => show(contact.roomId)} />
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      {:else}
        {#if known.length}
          <section aria-labelledby="new-chat-known">
            <h3 id="new-chat-known">{t('roomList.new.yourChats')}</h3>
            <ul class="rows">
              {#each known as contact (contact.id)}
                <li>
                  <PersonRow {session} name={contact.name} subtitle={contact.id} seed={contact.id} avatarUrl={contact.avatarUrl} onclick={() => show(contact.roomId)} />
                </li>
              {/each}
            </ul>
          </section>
        {/if}
        <section aria-labelledby="new-chat-server">
          <h3 id="new-chat-server">{t('roomList.new.onServer')}</h3>
          <ul class="rows">
            {#if writeToTyped && typedId}
              <li>
                <PersonRow
                  {session}
                  name={typedId}
                  subtitle={t('roomList.new.writeTo')}
                  seed={typedId}
                  busy={opening === typedId}
                  disabled={opening !== null}
                  onclick={() => void write(typedId)}
                />
              </li>
            {/if}
            {#each strangers as person (person.id)}
              <li>
                <PersonRow
                  {session}
                  name={person.name}
                  subtitle={person.id}
                  seed={person.id}
                  avatarUrl={person.avatarUrl}
                  busy={opening === person.id}
                  disabled={opening !== null}
                  onclick={() => void write(person.id)}
                />
              </li>
            {/each}
          </ul>
          {#if searchFailed}
            <p class="secondary">{t('roomList.new.searchFailed')}</p>
          {:else if !searching && !strangers.length && !known.length && !typedId}
            <p class="secondary">{t('roomList.new.nobodyFound')}</p>
          {/if}
        </section>
      {/if}
    </div>
    {#if failure}<p class="problem" role="alert">{t(failure)}</p>{/if}
    <PlainButton onclick={onclose}>{t('room.manage.cancel')}</PlainButton>
  {:else if page === 'newRoom'}
    <form onsubmit={create}>
      <TextField bind:value={name} label={t('room.manage.nameHeader')} showLabel placeholder={t('room.manage.namePlaceholder')} autofocus />
      <div class="field">
        <label for="new-room-topic">{t('room.about')}</label>
        <textarea id="new-room-topic" bind:value={topic} rows="3" placeholder={t('room.manage.topicPlaceholder')}></textarea>
      </div>
      <label class="toggle">
        <span>
          <strong>{t('room.manage.openToAnyone')}</strong>
          <span class="help">{t('room.manage.openToAnyoneHelp')}</span>
        </span>
        <input type="checkbox" role="switch" bind:checked={isOpen} />
      </label>
      <!-- Чем комната будет — тем же замком, что в «О чате», и сразу, как щёлкнул тумблер. -->
      <p class="privacy" class:open={isOpen}>
        <Icon name={isOpen ? 'unlock' : 'lock'} />
        <span>{t(isOpen ? 'roomList.new.willNotBeEncrypted' : 'roomList.new.willBeEncrypted')}</span>
      </p>
      <p class="help">{t('roomList.new.openMeansUnencrypted')}</p>
      {#if failure}<p class="problem" role="alert">{t(failure)}</p>{/if}
      <PrimaryButton type="submit" wide busy={creating} disabled={!name.trim()}>{t('roomList.new.create')}</PrimaryButton>
    </form>
  {:else if page === 'publicRooms'}
    <TextField bind:value={roomsQuery} label={t('roomList.new.roomsPrompt')} placeholder={t('roomList.new.roomsPrompt')} autocomplete="off" autofocus />
    {#if directory}
      <ul class="rows" aria-busy={directory.loading}>
        {#each directory.rooms as room, index (room.id)}
          {#if index === directory.rooms.length - 1 && directory.hasMore}
            <li use:more>{@render publicRoomRow(room)}</li>
          {:else}
            <li>{@render publicRoomRow(room)}</li>
          {/if}
        {/each}
      </ul>
      {#if directory.failed}
        <p class="retry">
          <span class="secondary">{t('roomList.new.directoryFailed')}</span>
          <PlainButton onclick={() => void directory?.search(roomsQuery)}>{t('roomList.new.retry')}</PlainButton>
        </p>
      {:else if !directory.loading && !directory.rooms.length}
        <p class="secondary">{t('roomList.new.noRooms')}</p>
      {/if}
    {/if}
    {#if failure}<p class="problem" role="alert">{t(failure)}</p>{/if}
  {:else}
    <form onsubmit={joinAddress}>
      <TextField
        bind:value={address}
        label={t('roomList.new.joinByAddress')}
        placeholder={t('roomList.new.addressPlaceholder')}
        autocomplete="off"
        inputmode="url"
        autofocus
      />
      <p class="help">{t('roomList.new.addressHelp')}</p>
      {#if failure}<p class="problem" role="alert">{t(failure)}</p>{/if}
      <PrimaryButton type="submit" wide busy={joiningAddress} disabled={!address.trim()}>{t('roomList.new.join')}</PrimaryButton>
    </form>
  {/if}
</Dialog>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-close);
  }
  .rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
  }
  h3 {
    margin: 0;
    padding-inline: var(--space-normal);
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    font-weight: 600;
    text-transform: uppercase;
  }
  .action {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    width: 100%;
    min-height: var(--tap-target);
    padding: var(--space-close) var(--space-normal);
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  @media (hover: hover) {
    .action:hover {
      background: var(--color-selected);
    }
  }
  /* Значок — по ширине лица в строках ниже: слова стоят в одну линию с именами. */
  .action-icon {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--size-avatar);
    color: var(--accent);
  }
  .action-icon :global(svg) {
    width: var(--size-icon-button);
    height: var(--size-icon-button);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
  }
  .field label {
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  textarea {
    padding: var(--space-normal) var(--space-roomy);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-control);
    background: var(--color-background);
    resize: vertical;
  }
  textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 0;
    border-color: transparent;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    cursor: pointer;
  }
  .toggle > span {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-tight);
  }
  .privacy {
    display: flex;
    align-items: center;
    gap: var(--space-tight);
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .privacy :global(svg) {
    flex: none;
    width: var(--font-size-caption);
    height: var(--font-size-caption);
  }
  .privacy.open :global(svg) {
    color: var(--color-warning);
  }
  .help,
  .secondary {
    margin: 0;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .secondary {
    padding-inline: var(--space-normal);
  }
  .retry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-close);
    margin: 0;
  }
  .problem {
    margin: 0;
    color: var(--color-danger);
    font-size: var(--font-size-caption);
  }
</style>
