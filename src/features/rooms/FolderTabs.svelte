<!--
  Папки вкладками над списком — `FolderTabs` нативной Искры: «Все» первой, дальше каждая
  папка с числом чатов, где есть непрочитанное. Нет папок — нет и полосы: полоса с одной
  вкладкой — переключатель, который ничего не переключает.

  Выбранная — серой плашкой, не акцентом: вкладка — это где вы, а не кнопка, которую жать.
  Правый щелчок по полосе ведёт к настройкам папок, как её меню в нативной.
-->
<script lang="ts">
  import { router } from '../../core/navigation/router.svelte.ts';
  import { roomsOf, type ChatFolder } from '../../core/rooms/folders';
  import { hasUnread, type RoomSummary } from '../../core/rooms/types';
  import { t } from '../../i18n/index.svelte.ts';

  interface Props {
    folders: readonly ChatFolder[];
    list: readonly RoomSummary[];
    archived: readonly RoomSummary[];
    /** ID папки; пусто — «Все». */
    selected: string;
    onselect: (id: string) => void;
  }
  let { folders, list, archived, selected, onselect }: Props = $props();

  const tabs = $derived([
    { id: '', name: t('folders.all'), unread: list.filter(hasUnread).length },
    ...folders.map((folder) => ({ id: folder.id, name: folder.name, unread: roomsOf(folder, list, archived).filter(hasUnread).length })),
  ]);

  let strip: HTMLDivElement | undefined = $state();
  // Выбранная — в видимую часть полосы, если папок больше, чем влезло.
  $effect(() => {
    const id = selected;
    strip?.querySelector<HTMLElement>(`[data-folder="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  /** ←/→ — по вкладкам, как у любого списка вкладок. */
  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const at = tabs.findIndex((tab) => tab.id === selected);
    const next = tabs[at + (event.key === 'ArrowRight' ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    onselect(next.id);
    strip?.querySelector<HTMLElement>(`[data-folder="${CSS.escape(next.id)}"]`)?.focus();
  }

  function oncontextmenu(event: MouseEvent) {
    event.preventDefault();
    router.go({ name: 'settings', section: 'folders' });
  }
</script>

<div class="strip" role="tablist" aria-label={t('folders.title')} tabindex="-1" bind:this={strip} {onkeydown} {oncontextmenu}>
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      role="tab"
      data-folder={tab.id}
      aria-selected={tab.id === selected}
      tabindex={tab.id === selected ? 0 : -1}
      onclick={() => onselect(tab.id)}
    >
      <span class="name">{tab.name}</span>
      {#if tab.unread > 0}<span class="count">{tab.unread}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .strip {
    display: flex;
    gap: var(--space-tight);
    padding: var(--space-tight) var(--space-close);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .strip::-webkit-scrollbar {
    display: none;
  }
  button {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-tight);
    min-height: var(--size-icon-button);
    padding: var(--space-tight) var(--space-normal);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-caption);
    cursor: pointer;
  }
  button[aria-selected='true'] {
    background: var(--color-selected);
    font-weight: 600;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    min-width: var(--size-icon);
    padding: 0 var(--space-tight);
    border-radius: var(--radius-circle);
    background: var(--color-selected);
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
</style>
