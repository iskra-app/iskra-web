<!--
  «Переслать в…» — `ForwardPicker` нативной Искры, лист Telegram: лица чатов сеткой, отмечать
  можно сколько угодно, внизу — строка комментария и кнопка «Отправить».

  Выбор и отправка раздельны: ничего не уходит, пока не нажата кнопка. Раньше в нативной список
  отправлял с первого нажатия — переслать двоим было двумя заходами в меню, и сказать что-то о
  пересланном было негде.
-->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import RoomFace from '../rooms/RoomFace.svelte';
  import { roomName } from '../rooms/text';

  interface Props {
    open: boolean;
    session: UserSession;
    onsend: (roomIds: string[], comment: string) => void;
    onclose: () => void;
  }
  let { open, session, onsend, onclose }: Props = $props();

  let query = $state('');
  let chosen = $state<string[]>([]);
  let comment = $state('');

  $effect(() => {
    if (!open) return;
    query = '';
    chosen = [];
    comment = '';
  });

  /** Куда можно: чаты, где вы есть, — не приглашения и не пространства; в порядке списка чатов, архив — в конце. */
  const destinations = $derived(
    [...session.rooms.organized.list, ...session.rooms.organized.archived].filter((room) => room.membership === 'join' && room.kind !== 'space'),
  );
  const shown = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? destinations.filter((room) => roomName(room).toLocaleLowerCase().includes(needle)) : destinations;
  });

  function toggle(roomId: string) {
    chosen = chosen.includes(roomId) ? chosen.filter((id) => id !== roomId) : [...chosen, roomId];
  }

  function send(event: SubmitEvent) {
    event.preventDefault();
    if (chosen.length) onsend(chosen, comment);
  }
</script>

<Dialog {open} title={t('message.forward.title')} {onclose}>
  <TextField bind:value={query} label={t('message.forward.prompt')} placeholder={t('message.forward.prompt')} autofocus />
  <ul class="grid" aria-label={t('message.forward.title')}>
    {#each shown as room (room.id)}
      {@const on = chosen.includes(room.id)}
      <li>
        <button type="button" role="checkbox" aria-checked={on} class:on onclick={() => toggle(room.id)}>
          <span class="face">
            <RoomFace {room} {session} />
            {#if on}
              <span class="tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg></span>
            {/if}
          </span>
          <span class="name">{roomName(room)}</span>
        </button>
      </li>
    {/each}
  </ul>
  <form onsubmit={send}>
    {#if chosen.length}
      <TextField bind:value={comment} label={t('message.forward.comment')} placeholder={t('message.forward.comment')} />
    {/if}
    <PrimaryButton type="submit" wide disabled={chosen.length === 0}>{t('message.forward.send')}</PrimaryButton>
    <PlainButton onclick={onclose}>{t('message.forward.cancel')}</PlainButton>
  </form>
</Dialog>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--forward-columns), minmax(0, 1fr));
    gap: var(--space-normal) var(--space-close);
    max-height: var(--size-forward-grid);
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
  }
  .grid button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-tight);
    width: 100%;
    padding: var(--space-tight);
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .grid button:focus-visible {
    outline: var(--border-thick) solid var(--accent);
  }
  .face {
    position: relative;
    width: var(--size-room-avatar);
    height: var(--size-room-avatar);
  }
  .on .face {
    outline: var(--border-thick) solid var(--accent);
    outline-offset: var(--border-thick);
    border-radius: var(--radius-circle);
  }
  .tick {
    position: absolute;
    inset-block-end: 0;
    inset-inline-end: 0;
    display: grid;
    place-items: center;
    width: var(--size-icon);
    height: var(--size-icon);
    border: var(--border-thick) solid var(--color-background);
    border-radius: var(--radius-circle);
    background: var(--accent);
  }
  .tick svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: var(--on-accent);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .name {
    display: -webkit-box;
    max-width: 100%;
    overflow: hidden;
    font-size: var(--font-size-caption);
    text-align: center;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
</style>
