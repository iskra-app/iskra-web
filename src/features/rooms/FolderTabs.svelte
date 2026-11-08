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

  // Плашка выбранной скользит к новой вкладке, а не перепрыгивает.
  let thumb = $state({ x: 0, width: 0, ready: false });
  function measure() {
    const el = strip?.querySelector<HTMLElement>(`[data-folder="${CSS.escape(selected)}"]`);
    if (el) thumb = { x: el.offsetLeft, width: el.offsetWidth, ready: true };
  }
  $effect(() => {
    void tabs;
    void selected;
    measure();
    if (!strip || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => observer.disconnect();
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
  <span class="thumb" class:ready={thumb.ready} style:translate="{thumb.x}px 0" style:width="{thumb.width}px" aria-hidden="true"></span>
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
    position: relative;
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
  button {
    position: relative;
    transition: color var(--timing-chrome) var(--ease-out);
  }
  button[aria-selected='true'] {
    font-weight: 600;
  }
  .thumb {
    position: absolute;
    inset-block: var(--space-tight);
    inset-inline-start: 0;
    border-radius: var(--radius-circle);
    background: var(--color-selected);
    pointer-events: none;
  }
  .thumb.ready {
    transition:
      translate var(--timing-screen) var(--ease-menu-open),
      width var(--timing-screen) var(--ease-menu-open);
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
    text-align: center;
    animation: count-pop var(--timing-reaction) var(--ease-menu-open);
  }
  @keyframes count-pop {
    from {
      transform: scale(var(--motion-icon-scale-from));
      opacity: 0;
    }
  }
</style>
