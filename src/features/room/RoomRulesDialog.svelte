<!--
  «Роли и разрешения» — `RoomRulesView` нативной: кто управляет чатом и кому что можно. Открывается
  из «Изменить чат» тем, кто может менять роли.

  Два списка. Администраторы и модераторы — со «Снять роль» и «Добавить» под ними: назначить
  кого-то из остальных. И правила комнаты — у каждого нижняя ступень, которой можно: все,
  модераторы, администраторы. Правило выше моей ступени — факт, а не серый выбор.
-->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import { roomRules, type MemberSummary, type RoomDetailsStore, type RoomRole, type RoomRule } from '../../core/rooms/roomDetails.svelte.ts';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import RoleDialog from './RoleDialog.svelte';

  let { open, details, onclose }: { open: boolean; details: RoomDetailsStore; onclose: () => void } = $props();

  const roleLabel: Record<RoomRole, TextKey> = { administrator: 'room.administrator', moderator: 'room.moderator', member: 'room.manage.member' };
  const ruleLabel: Record<RoomRule, TextKey> = {
    sendMessages: 'room.rules.sendMessages',
    invite: 'room.rules.invite',
    remove: 'room.rules.remove',
    ban: 'room.rules.ban',
    deleteOthers: 'room.rules.deleteOthers',
    rename: 'room.rules.rename',
    changeTopic: 'room.rules.changeTopic',
    changePicture: 'room.rules.changePicture',
  };
  const choiceLabel: Record<RoomRole, TextKey> = { member: 'room.rules.everyone', moderator: 'room.rules.moderators', administrator: 'room.rules.administrators' };

  /** Выбирают, кого назначить; `null` — список не открыт. */
  let appointing = $state(false);
  /** Кому выбирают роль — окно «Что может …?». */
  let choosing = $state<MemberSummary | null>(null);
  $effect(() => {
    if (!open) appointing = false;
  });

  /** Кого можно назначить: в чате, без роли, и мне есть что ему дать сверх «участника». */
  const candidates = $derived(details.members.filter((m) => m.role === 'member' && !m.invited && details.rolesFor(m).some((r) => r !== 'member')));
</script>

<Dialog
  {open}
  title={appointing ? t('room.rules.appointTitle') : t('room.rules.title')}
  back={appointing ? { label: t('room.rules.title'), onclick: () => (appointing = false) } : undefined}
  {onclose}
>
  {#if appointing}
    {#if candidates.length}
      <ul class="group">
        {#each candidates as member (member.id)}
          <li><button type="button" class="pick" onclick={() => (choosing = member)}>{member.name}</button></li>
        {/each}
      </ul>
    {:else}
      <p class="secondary">{t('room.rules.nobodyToAppoint')}</p>
    {/if}
  {:else}
    <section aria-labelledby="staff-title">
      <h3 id="staff-title">{t('room.rules.staffHeader')}</h3>
      <ul class="group">
        {#each details.staff as member (member.id)}
          <li class="row">
            <span class="who">
              <span class="name">{member.name}</span>
              <span class="secondary">{t(roleLabel[member.role])}</span>
            </span>
            {#if details.rolesFor(member).includes('member')}
              <PlainButton onclick={() => void details.setRole(member, 'member')}>{t('room.rules.demote')}</PlainButton>
            {/if}
          </li>
        {/each}
        {#if details.permissions.canChangeRoles}
          <li><button type="button" class="pick add" onclick={() => (appointing = true)}>{t('room.rules.addStaff')}</button></li>
        {/if}
      </ul>
      <p class="secondary">{t('room.rules.staffFooterWeb')}</p>
    </section>

    {#if details.rules}
      {@const rules = details.rules}
      <section aria-labelledby="rules-title">
        <h3 id="rules-title">{t('room.rules.rulesHeader')}</h3>
        <ul class="group">
          {#each roomRules as rule (rule)}
            {@const choices = details.rolesForRule(rule)}
            <li class="row">
              <span class="name">{t(ruleLabel[rule])}</span>
              {#if choices.length > 1}
                <select
                  aria-label={t(ruleLabel[rule])}
                  value={rules[rule]}
                  onchange={(event) => void details.setRule(rule, event.currentTarget.value as RoomRole)}
                >
                  {#each choices as role (role)}
                    <option value={role}>{t(choiceLabel[role])}</option>
                  {/each}
                </select>
              {:else}
                <span class="secondary">{t(choiceLabel[rules[rule]])}</span>
              {/if}
            </li>
          {/each}
        </ul>
        <p class="secondary">{t('room.rules.rulesFooter')}</p>
      </section>
    {/if}
  {/if}
</Dialog>

<RoleDialog
  member={choosing}
  {details}
  onclose={() => {
    choosing = null;
    appointing = false;
  }}
/>

<style>
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
  .group > li + li {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-normal);
    min-height: var(--tap-target);
    padding: var(--space-tight) var(--space-normal);
  }
  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pick {
    width: 100%;
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .add {
    color: var(--accent);
  }
  select {
    min-height: var(--tap-target);
    border: none;
    background: transparent;
    color: var(--accent);
    font: inherit;
    text-align: end;
    cursor: pointer;
  }
  .secondary {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
</style>
