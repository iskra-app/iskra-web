<!--
  Страница человека — `MemberProfileView` нативной (страница Telegram): лицо, имя, ID; плитки
  того, что делают *с* человеком — «Написать», «Поделиться», «QR-код»; потом что о нём известно —
  «Matrix ID» и роль; роль выбором — тем, кто может её менять; красное — внизу: убрать из чата,
  заблокировать в чате и последним — заблокировать для всего аккаунта.

  Открывается из списка участников и по лицу или имени в ленте. Живёт в панели «О чате»,
  «Назад» — к ней.
-->
<script lang="ts">
  import Avatar from '../../design/Avatar.svelte';
  import ConfirmDialog from '../../design/ConfirmDialog.svelte';
  import Icon from '../../design/Icon.svelte';
  import IconButton from '../../design/IconButton.svelte';
  import { viewport } from '../../design/viewport.svelte.ts';
  import { shareLink } from '../../core/navigation/links';
  import type { MemberSummary, RoomDetailsStore, RoomRole } from '../../core/rooms/roomDetails.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import QrCodeDialog from '../app/QrCodeDialog.svelte';
  import MatrixIdField from './MatrixIdField.svelte';

  interface Props {
    session: UserSession;
    details: RoomDetailsStore;
    member: MemberSummary;
    photo?: string | undefined;
    onback: () => void;
    onwrite: (member: MemberSummary) => void;
  }
  let { session, details, member, photo, onback, onwrite }: Props = $props();

  const labels: Record<RoomRole, TextKey> = { administrator: 'room.administrator', moderator: 'room.moderator', member: 'room.manage.member' };
  const me = $derived(member.id === session.userId);
  const roles = $derived(details.rolesFor(member));
  const canRemove = $derived(details.mayRemove(member));
  const canBan = $derived(details.mayBan(member));
  const blocked = $derived(session.blocked.has(member.id));
  const link = $derived(shareLink(member.id));

  let showingCode = $state(false);
  let linkCopied = $state(false);
  let banning = $state(false);
  let blocking = $state(false);

  async function share() {
    if (typeof navigator.share === 'function' && !viewport.finePointer) {
      await navigator.share({ url: link }).catch(() => {});
      return;
    }
    await navigator.clipboard
      .writeText(link)
      .then(() => (linkCopied = true))
      .catch(() => {});
  }

  async function remove() {
    if (await details.remove(member)) onback();
  }
</script>

<div class="profile">
  <div class="back">
    <IconButton label={t('room.back')} onclick={onback}><Icon name="back" /></IconButton>
  </div>
  <header>
    <span class="face"><Avatar name={member.name} seed={member.id} {photo} mode={preferences.faces} /></span>
    <h2>{member.name}</h2>
    <p class="subtitle">{member.id}</p>
  </header>

  <div class="tiles">
    {#if !me && !member.invited}
      <button type="button" class="tile" onclick={() => onwrite(member)}>
        <Icon name="chats" />
        <span>{t('profile.message')}</span>
      </button>
    {/if}
    <button type="button" class="tile" onclick={() => void share()}>
      <Icon name="share" />
      <span>{t('profile.share')}</span>
    </button>
    <button type="button" class="tile" onclick={() => (showingCode = true)}>
      <Icon name="qr" />
      <span>{t('qr.title')}</span>
    </button>
  </div>
  {#if linkCopied}<p class="note" role="status">{t('room.linkCopiedWeb')}</p>{/if}

  <div class="card">
    <MatrixIdField userId={member.id} />
    <div class="role">
      <span>{t('room.manage.role')}</span>
      <span class="value">{t(labels[member.role])}</span>
    </div>
  </div>

  {#if roles.length > 0}
    <section aria-labelledby="profile-role-title">
      <h3 id="profile-role-title">{t('room.manage.roleHeader')}</h3>
      <div class="options" role="radiogroup" aria-labelledby="profile-role-title">
        {#each roles as role (role)}
          <button type="button" role="radio" aria-checked={member.role === role} class:chosen={member.role === role} onclick={() => void details.setRole(member, role)}>
            {t(labels[role])}
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if canRemove || canBan}
    <div class="group">
      {#if canRemove}
        <button type="button" class="danger" onclick={() => void remove()}>{t('room.manage.remove')}</button>
      {/if}
      {#if canBan}
        <button type="button" class="danger" onclick={() => (banning = true)}>{t('room.manage.block')}</button>
      {/if}
    </div>
  {/if}

  {#if !me}
    <!-- Блок аккаунта — последним, на том же месте, что и в «О чате» личного. -->
    <div class="group">
      <button type="button" class="danger" onclick={() => (blocked ? void session.blocked.unblock(member.id) : (blocking = true))}>
        {t(blocked ? 'profile.unblockUser' : 'profile.blockUser')}
      </button>
    </div>
    {#if blocked}<p class="note">{t('profile.blockedNotice')}</p>{/if}
  {/if}
</div>

<QrCodeDialog open={showingCode} {link} name={member.name} subtitle={member.id} seed={member.id} {photo} onclose={() => (showingCode = false)} />

<ConfirmDialog
  open={banning}
  title={t('room.manage.blockQuestion', { name: member.name })}
  message={t('room.manage.blockHelp')}
  confirmLabel={t('room.manage.block')}
  cancelLabel={t('room.manage.cancel')}
  destructive
  onclose={() => (banning = false)}
  onconfirm={() => {
    banning = false;
    void details.ban(member).then((ok) => ok && onback());
  }}
/>

<ConfirmDialog
  open={blocking}
  title={t('message.menu.blockConfirm', { name: member.name })}
  message={t('message.menu.blockConfirmMessage')}
  confirmLabel={t('message.menu.block')}
  cancelLabel={t('common.cancel')}
  destructive
  onclose={() => (blocking = false)}
  onconfirm={() => {
    blocking = false;
    void session.blocked.block(member.id);
  }}
/>

<style>
  .profile {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  .back {
    margin-inline-start: calc(-1 * var(--space-close));
  }
  header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-tight);
    text-align: center;
  }
  .face {
    --avatar-size: var(--size-avatar-large);
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-title);
    overflow-wrap: anywhere;
  }
  .subtitle {
    margin: 0;
    color: var(--color-text-secondary);
    overflow-wrap: anywhere;
    user-select: text;
  }
  .tiles {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: var(--space-close);
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-tight);
    padding: var(--space-close);
    border: none;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    color: var(--accent);
    font: inherit;
    font-size: var(--font-size-caption);
    cursor: pointer;
  }
  .tile :global(svg) {
    width: var(--size-icon-button);
    height: var(--size-icon-button);
  }
  .card {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    overflow: hidden;
  }
  .role {
    display: flex;
    justify-content: space-between;
    gap: var(--space-normal);
    padding: var(--space-close) var(--space-normal);
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .value {
    color: var(--color-text-secondary);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-close);
  }
  h3 {
    margin: 0;
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
  }
  .options,
  .group {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    overflow: hidden;
  }
  .options button,
  .group button {
    display: flex;
    align-items: center;
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .options button + button,
  .group button + button {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .options button.chosen {
    font-weight: 600;
    color: var(--accent);
  }
  .group .danger {
    justify-content: center;
    color: var(--color-danger);
    font-weight: 600;
  }
  .note {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    text-align: center;
  }
</style>
