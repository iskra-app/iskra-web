<!--
  Одна папка — новая или изменяемая: `FolderEditor` нативной Искры. Название, какие чаты,
  условия и чаты, названные вручную по обе стороны правила. Ничего не сохраняется до
  «Готово» — в отличие от остальных настроек: недоделанная папка — вкладка над списком,
  которая до конца правки показывала бы не те чаты.
-->
<script lang="ts">
  import ConfirmDialog from '../../design/ConfirmDialog.svelte';
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import { folderKinds, isMeaningful, type ChatFolder } from '../../core/rooms/folders';
  import { fold } from '../../core/rooms/organize';
  import type { RoomSummary } from '../../core/rooms/types';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import RoomFace from '../rooms/RoomFace.svelte';
  import { roomName } from '../rooms/text';

  interface Props {
    /** Копия: правится здесь, уходит наверх только по «Готово». */
    folder: ChatFolder;
    isNew: boolean;
    /** Все чаты, из которых выбирать, — список и архив, без приглашений. */
    rooms: readonly RoomSummary[];
    session: UserSession;
    onsave: (folder: ChatFolder) => void;
    ondelete: (id: string) => void;
    onclose: () => void;
  }
  let { folder: initial, isNew, rooms, session, onsave, ondelete, onclose }: Props = $props();

  // svelte-ignore state_referenced_locally
  let folder = $state<ChatFolder>(structuredClone($state.snapshot(initial)));
  let choosing = $state<'included' | 'excluded' | null>(null);
  let chosen = $state<string[]>([]);
  let query = $state('');
  let confirmingDelete = $state(false);
  const sides = ['included', 'excluded'] as const;

  const named = (ids: readonly string[]) => ids.map((id) => rooms.find((room) => room.id === id)).filter((room) => room !== undefined);
  const shown = $derived(query.trim() ? rooms.filter((room) => fold(roomName(room)).includes(fold(query.trim()))) : rooms);

  function toggleKind(kind: (typeof folderKinds)[number], on: boolean) {
    folder.kinds = on ? [...folder.kinds.filter((k) => k !== kind), kind] : folder.kinds.filter((k) => k !== kind);
  }

  function choose(side: 'included' | 'excluded') {
    chosen = [...folder[side]];
    query = '';
    choosing = side;
  }

  /** Выбранные — в одну сторону, и из другой их долой: чат не бывает и там и там. */
  function chooseDone() {
    if (!choosing) return;
    const ordered = rooms.map((room) => room.id).filter((id) => chosen.includes(id));
    const other = choosing === 'included' ? 'excluded' : 'included';
    folder[choosing] = ordered;
    folder[other] = folder[other].filter((id) => !chosen.includes(id));
    choosing = null;
  }

  function remove(side: 'included' | 'excluded', id: string) {
    folder[side] = folder[side].filter((other) => other !== id);
  }

  function done() {
    onsave({ ...$state.snapshot(folder), name: folder.name.trim() });
    onclose();
  }
</script>

<Dialog open={true} title={isNew ? t('folders.new') : t('folders.edit')} {onclose}>
  <div class="editor">
    <TextField bind:value={folder.name} label={t('folders.namePlaceholder')} placeholder={t('folders.namePlaceholder')} autofocus={isNew} />

    <h3 id="folder-kinds">{t('folders.kindsHeader')}</h3>
    <div class="group" role="group" aria-labelledby="folder-kinds">
      {#each folderKinds as kind (kind)}
        <label class="switch">
          <span>{t(`folders.kind.${kind}`)}</span>
          <input type="checkbox" role="switch" checked={folder.kinds.includes(kind)} onchange={(event) => toggleKind(kind, event.currentTarget.checked)} />
        </label>
      {/each}
    </div>

    <h3 id="folder-conditions">{t('folders.conditionsHeader')}</h3>
    <div class="group" role="group" aria-labelledby="folder-conditions">
      <label class="switch"><span>{t('folders.onlyUnread')}</span><input type="checkbox" role="switch" bind:checked={folder.onlyUnread} /></label>
      <label class="switch"><span>{t('folders.excludesMuted')}</span><input type="checkbox" role="switch" bind:checked={folder.excludesMuted} /></label>
      <label class="switch"><span>{t('folders.includesArchived')}</span><input type="checkbox" role="switch" bind:checked={folder.includesArchived} /></label>
    </div>

    {#each sides as side (side)}
      <h3 id="folder-{side}">{t(side === 'included' ? 'folders.includedHeader' : 'folders.excludedHeader')}</h3>
      <ul class="group" aria-labelledby="folder-{side}">
        {#each named(folder[side]) as room (room.id)}
          <li class="chat">
            <span class="face"><RoomFace {room} {session} /></span>
            <span class="chat-name">{roomName(room)}</span>
            <PlainButton onclick={() => remove(side, room.id)}>{t('folders.removeChatWeb')}</PlainButton>
          </li>
        {/each}
        <li><PlainButton onclick={() => choose(side)}>{t('folders.addChats')}</PlainButton></li>
      </ul>
    {/each}

    {#if !isNew}
      <PlainButton danger onclick={() => (confirmingDelete = true)}>{t('folders.delete')}</PlainButton>
    {/if}

    <div class="actions">
      <PlainButton onclick={onclose}>{t('folders.cancel')}</PlainButton>
      <PrimaryButton disabled={!isMeaningful(folder)} onclick={done}>{t('folders.done')}</PrimaryButton>
    </div>
  </div>
</Dialog>

<Dialog open={choosing !== null} title={t('folders.chooseChats')} onclose={() => (choosing = null)}>
  <div class="editor">
    <TextField bind:value={query} label={t('folders.searchWeb')} placeholder={t('folders.searchWeb')} />
    <ul class="group choices">
      {#each shown as room (room.id)}
        <li>
          <label class="chat">
            <span class="face"><RoomFace {room} {session} /></span>
            <span class="chat-name">{roomName(room)}</span>
            <input type="checkbox" bind:group={chosen} value={room.id} />
          </label>
        </li>
      {/each}
    </ul>
    <div class="actions">
      <PlainButton onclick={() => (choosing = null)}>{t('folders.cancel')}</PlainButton>
      <PrimaryButton onclick={chooseDone}>{t('folders.done')}</PrimaryButton>
    </div>
  </div>
</Dialog>

<ConfirmDialog
  open={confirmingDelete}
  title={t('folders.deleteQuestion', { name: folder.name })}
  message={t('folders.deleteHelp')}
  confirmLabel={t('folders.delete')}
  cancelLabel={t('folders.cancel')}
  destructive
  onclose={() => (confirmingDelete = false)}
  onconfirm={() => {
    confirmingDelete = false;
    ondelete(folder.id);
    onclose();
  }}
/>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  h3 {
    margin: var(--space-close) 0 0;
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
  }
  .group {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    list-style: none;
    overflow: hidden;
  }
  .group > * + * {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .choices {
    max-height: var(--size-media-max-height);
    overflow-y: auto;
  }
  .switch,
  .chat {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    min-height: var(--tap-target);
    padding: var(--space-tight) var(--space-normal);
    cursor: pointer;
  }
  .switch {
    justify-content: space-between;
  }
  .switch input,
  .chat input {
    width: var(--size-icon);
    height: var(--size-icon);
    accent-color: var(--accent);
  }
  .face {
    --avatar-size: var(--size-avatar-small);
    display: flex;
  }
  .chat-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    display: grid;
    grid-auto-flow: column;
    gap: var(--space-close);
  }
</style>
