<!--
  «В папку» из меню чата — `FolderMembershipSheet` нативной: все папки с галочками, есть ли в
  них этот чат. Каждое нажатие сразу уходит на сервер, как у нативной: «Готово» только
  закрывает. Галочка — чат в папке, даже если не подходит под её правило; снятая — не попадёт
  в неё никогда.
-->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import { contains } from '../../core/rooms/folders';
  import type { RoomSummary } from '../../core/rooms/types';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import { roomName } from './text';

  interface Props {
    /** Чат, для которого выбирают; `null` — окно закрыто. */
    room: RoomSummary | null;
    session: UserSession;
    onclose: () => void;
  }
  let { room, session, onclose }: Props = $props();

  const store = $derived(session.folders);
  const offline = $derived(session.connection === 'offline');
  /** Живая сводка, а не та, с которой открыли: метка «в архиве» и прочее могли смениться. */
  const current = $derived(room ? (session.rooms.get(room.id) ?? room) : null);
</script>

<Dialog open={!!room} title={current ? roomName(current) : ''} {onclose}>
  {#if current}
    <div class="membership">
      <ul class="group" aria-label={t('folders.addToFolder')}>
        {#each store.folders as folder (folder.id)}
          <li>
            <label class="folder">
              <span class="name">{folder.name}</span>
              <input
                type="checkbox"
                role="switch"
                checked={contains(folder, current)}
                disabled={offline}
                onchange={(event) => void store.setMembership(current.id, folder.id, event.currentTarget.checked)}
              />
            </label>
          </li>
        {/each}
      </ul>
      <p class="secondary">{t('folders.membershipFooter')}</p>
      {#if store.failed}<p class="problem" role="alert">{t('folders.saveFailed')}</p>{/if}
      <PrimaryButton onclick={onclose}>{t('folders.done')}</PrimaryButton>
    </div>
  {/if}
</Dialog>

<style>
  .membership {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
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
  .folder {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    min-height: var(--tap-target);
    padding: var(--space-tight) var(--space-normal);
    cursor: pointer;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
