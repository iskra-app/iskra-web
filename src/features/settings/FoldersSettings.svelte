<!--
  «Папки» — `FoldersView` нативной Искры: папки в порядке вкладок, у каждой — сколько в ней
  чатов; нажатие — правка. Порядок — кнопками «выше» и «ниже»: перетаскивание мышью и
  пальцем в вебе — отдельная механика, а пара кнопок работает и с клавиатуры. Пока папок
  мало — три, которые предлагает Telegram. Всё здесь — запрос к серверу: без сети неактивно.
-->
<script lang="ts">
  import Icon from '../../design/Icon.svelte';
  import IconButton from '../../design/IconButton.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import { newFolder, roomsOf, suggestion, suggestionKinds, type ChatFolder, type FolderSuggestion } from '../../core/rooms/folders';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import FolderEditor from './FolderEditor.svelte';

  let { session }: { session: UserSession } = $props();

  const store = $derived(session.folders);
  const organized = $derived(session.rooms.organized);
  const offline = $derived(session.connection === 'offline');
  const choosable = $derived([...organized.list, ...organized.archived].filter((room) => room.membership !== 'invite'));

  let editing = $state<{ folder: ChatFolder; isNew: boolean } | null>(null);

  const suggestionName: Record<FolderSuggestion, TextKey> = {
    personal: 'folders.kind.direct',
    groups: 'folders.kind.groups',
    unread: 'folders.suggestion.unread',
  };
  /** Подсказки, которых ещё нет по имени. */
  const suggestions = $derived(
    suggestionKinds.filter((kind) => !store.folders.some((f) => f.name.toLowerCase() === t(suggestionName[kind]).toLowerCase())),
  );
</script>

<ul class="rows" aria-label={t('folders.title')}>
  {#each store.folders as folder, index (folder.id)}
    <li>
      <button type="button" class="open" disabled={offline} onclick={() => (editing = { folder, isNew: false })}>
        <span class="name">{folder.name}</span>
        <span class="count">{roomsOf(folder, organized.list, organized.archived).length}</span>
      </button>
      <IconButton label={t('folders.moveUpWeb', { name: folder.name })} disabled={offline || index === 0} onclick={() => void store.move(folder.id, -1)}>
        <Icon name="up" />
      </IconButton>
      <IconButton label={t('folders.moveDownWeb', { name: folder.name })} disabled={offline || index === store.folders.length - 1} onclick={() => void store.move(folder.id, 1)}>
        <Icon name="down" />
      </IconButton>
    </li>
  {/each}
  {#if !store.isFull}
    <li>
      <button type="button" class="open new" disabled={offline} onclick={() => (editing = { folder: newFolder(), isNew: true })}>
        <Icon name="plus" />
        <span class="name">{t('folders.new')}</span>
      </button>
    </li>
  {/if}
</ul>
<p class="secondary">{t('folders.explanation')}</p>
{#if store.failed}<p class="problem" role="alert">{t('folders.saveFailed')}</p>{/if}

{#if suggestions.length > 0 && !store.isFull}
  <h3 id="folder-suggestions">{t('folders.suggested')}</h3>
  <ul class="rows" aria-labelledby="folder-suggestions">
    {#each suggestions as kind (kind)}
      <li class="suggestion">
        <span class="name">{t(suggestionName[kind])}</span>
        <PlainButton disabled={offline} onclick={() => void store.save(suggestion(kind, t(suggestionName[kind])))}>{t('folders.add')}</PlainButton>
      </li>
    {/each}
  </ul>
{/if}

{#if editing}
  <FolderEditor
    folder={editing.folder}
    isNew={editing.isNew}
    rooms={choosable}
    {session}
    onsave={(folder) => void store.save(folder)}
    ondelete={(id) => void store.delete(id)}
    onclose={() => (editing = null)}
  />
{/if}

<style>
  .rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    list-style: none;
    overflow: hidden;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space-tight);
    padding-inline-end: var(--space-tight);
  }
  li + li {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .suggestion {
    padding: var(--space-tight) var(--space-tight) var(--space-tight) var(--space-roomy);
  }
  .open {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-normal);
    min-width: 0;
    min-height: var(--tap-target);
    padding: var(--space-close) var(--space-roomy);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .open:disabled {
    cursor: default;
  }
  .new {
    color: var(--accent);
  }
  .new :global(svg) {
    width: var(--size-icon);
    height: var(--size-icon);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }
  h3 {
    margin: var(--space-close) 0 0;
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
  }
  .secondary {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .problem {
    margin: 0;
    color: var(--color-danger);
    font-size: var(--font-size-caption);
  }
</style>
