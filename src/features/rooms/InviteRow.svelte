<!--
  Приглашение — в том же списке, что и разговоры, и выглядит как их родственник: то же
  лицо, то же имя. Разница в том, что оно спрашивает, а не сообщает: вместо последнего
  сообщения — кто зовёт, вместо «открыть» — два ответа. Открыть его нельзя: вы ещё не в
  комнате, и то, что туда напишете, сервер не примет.
-->
<script lang="ts">
  import type { RoomSummary } from '../../core/rooms/types';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import RoomFace from './RoomFace.svelte';
  import { roomName } from './text';

  interface Props {
    room: RoomSummary;
    session: UserSession;
    onfailure: (key: 'roomAction.acceptInviteFailed' | 'roomAction.declineInviteFailed') => void;
  }
  let { room, session, onfailure }: Props = $props();
  let busy = $state<'accept' | 'decline' | null>(null);
  const offline = $derived(session.connection === 'offline');

  async function answer(kind: 'accept' | 'decline') {
    busy = kind;
    try {
      if (kind === 'accept') await session.rooms.accept(room.id);
      else await session.rooms.decline(room.id);
    } catch {
      onfailure(kind === 'accept' ? 'roomAction.acceptInviteFailed' : 'roomAction.declineInviteFailed');
    } finally {
      busy = null;
    }
  }
</script>

<div class="invite" role="group" aria-label={roomName(room)}>
  <RoomFace {room} {session} />
  <div class="body">
    <span class="name">{roomName(room)}</span>
    <span class="from">
      {room.invitedBy ? t('roomList.invite.from', { name: room.invitedBy }) : t('roomList.invite.unattributed')}
    </span>
    <!-- Два настоящих ответа, равные: зелёный и красный, по размеру своих слов, у начала строки
         (`AnswerStyle` нативной). Не «главная кнопка и выход»: ни один не подталкивает. -->
    <div class="actions">
      <!-- Без сети — серые: ответ уходит прямо на сервер, в очередь он не встаёт. -->
      <button type="button" class="answer yes" disabled={!!busy || offline} aria-busy={busy === 'accept'} onclick={() => void answer('accept')}>
        <span>{t('roomList.invite.accept')}</span>
      </button>
      <button type="button" class="answer no" disabled={!!busy || offline} aria-busy={busy === 'decline'} onclick={() => void answer('decline')}>
        <span>{t('roomList.invite.decline')}</span>
      </button>
    </div>
  </div>
</div>

<style>
  .invite {
    display: flex;
    gap: var(--space-normal);
    padding: var(--space-close) var(--space-normal);
    margin-inline: var(--space-tight);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    flex: 1;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .from {
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .actions {
    display: flex;
    gap: var(--space-tight);
  }
  /* Капсула меньше, чем цель: нажимается на всю высоту пальца, а видна строкой под текстом. */
  .answer {
    display: grid;
    place-items: center;
    min-height: var(--tap-target);
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    cursor: pointer;
  }
  .answer span {
    padding: var(--space-tight) var(--space-normal);
    border-radius: var(--radius-circle);
    color: var(--color-on-answer);
    font-size: var(--font-size-caption);
    font-weight: 600;
    white-space: nowrap;
  }
  .yes span {
    background: var(--color-answer-yes);
  }
  .no span {
    background: var(--color-answer-no);
  }
  .answer:disabled {
    cursor: default;
  }
  .answer:disabled span {
    opacity: 0.5;
  }
</style>
