<!--
  «Пригласить» — `InviteView` нативной: тех, кого знаете, — галочкой из списка по буквам; кого
  нет — поиском по серверу или Matrix ID целиком («Пригласить по этому адресу»). Кто уже в
  комнате — серым, «Уже в комнате». Выбранные чужие — своей группой сверху, чтобы галочка не
  пропала вместе с поиском. Кнопка говорит, скольких зовут: «Пригласить (3)».
-->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import { isMatrixId } from '../../core/rooms/create';
  import type { Person } from '../../core/rooms/directory.svelte.ts';
  import type { RoomDetailsStore } from '../../core/rooms/roomDetails.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import PersonRow from '../rooms/PersonRow.svelte';
  import { byLetter, contactsOf, matching } from '../rooms/contacts';

  let { open, session, details, onclose }: { open: boolean; session: UserSession; details: RoomDetailsStore; onclose: () => void } = $props();

  interface Chosen {
    id: string;
    name: string;
    avatarUrl?: string;
  }

  let query = $state('');
  let chosen = $state<Chosen[]>([]);
  let found = $state<Person[]>([]);
  let searching = $state(false);
  let searchFailed = $state(false);
  let inviting = $state(false);
  let failed = $state(false);

  // Новое открытие — с начала.
  $effect(() => {
    if (!open) return;
    query = '';
    chosen = [];
    failed = false;
  });

  const contacts = $derived(contactsOf([...session.rooms.organized.list, ...session.rooms.organized.archived]));
  const contactIds = $derived(new Set(contacts.map((c) => c.id)));
  const memberIds = $derived(new Set(details.members.map((m) => m.id)));
  const chosenIds = $derived(new Set(chosen.map((c) => c.id)));
  const term = $derived(query.trim());
  const known = $derived(matching(contacts, term));
  const strangers = $derived(found.filter((person) => !known.some((c) => c.id === person.id)));
  const typedId = $derived(isMatrixId(term) && term !== session.userId ? term : null);
  const inviteTyped = $derived(typedId !== null && !known.some((c) => c.id === typedId) && !strangers.some((p) => p.id === typedId));

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

  function toggle(person: Chosen) {
    chosen = chosenIds.has(person.id) ? chosen.filter((c) => c.id !== person.id) : [...chosen, person];
  }

  /** Всех выбранных — по очереди; кого сервер не принял, остаются выбранными, и об этом сказано. */
  async function invite() {
    if (!chosen.length || inviting) return;
    inviting = true;
    failed = false;
    const refused: Chosen[] = [];
    for (const person of chosen) if (!(await details.invite(person.id))) refused.push(person);
    inviting = false;
    chosen = refused;
    if (refused.length) failed = true;
    else onclose();
  }
</script>

{#snippet row(person: Chosen, subtitle: string)}
  <li>
    <PersonRow
      {session}
      name={person.name}
      subtitle={memberIds.has(person.id) ? t('room.invite.alreadyHere') : subtitle}
      seed={person.id}
      avatarUrl={person.avatarUrl}
      checked={memberIds.has(person.id) || chosenIds.has(person.id)}
      disabled={memberIds.has(person.id) || inviting}
      onclick={() => toggle(person)}
    />
  </li>
{/snippet}

<Dialog {open} title={t('room.manage.invite')} {onclose}>
  <TextField bind:value={query} label={t('roomList.new.searchPrompt')} placeholder={t('roomList.new.searchPrompt')} autocomplete="off" autofocus />
  <div class="list">
    {#if !term}
      {@const others = chosen.filter((c) => !contactIds.has(c.id))}
      {#if others.length}
        <section aria-labelledby="invite-chosen">
          <h3 id="invite-chosen">{t('room.invite.chosen')}</h3>
          <ul class="rows">
            {#each others as person (person.id)}{@render row(person, person.id)}{/each}
          </ul>
        </section>
      {/if}
      {#each byLetter(contacts) as group (group.letter)}
        <section aria-label={group.letter}>
          <h3>{group.letter}</h3>
          <ul class="rows">
            {#each group.people as contact (contact.id)}{@render row(contact, contact.id)}{/each}
          </ul>
        </section>
      {/each}
    {:else}
      {#if known.length}
        <section aria-labelledby="invite-known">
          <h3 id="invite-known">{t('roomList.new.yourChats')}</h3>
          <ul class="rows">
            {#each known as contact (contact.id)}{@render row(contact, contact.id)}{/each}
          </ul>
        </section>
      {/if}
      <section aria-labelledby="invite-server">
        <h3 id="invite-server">{t('roomList.new.onServer')}</h3>
        <ul class="rows">
          {#if inviteTyped && typedId}{@render row({ id: typedId, name: typedId }, t('room.invite.byAddress'))}{/if}
          {#each strangers as person (person.id)}{@render row(person, person.id)}{/each}
        </ul>
        {#if searchFailed}
          <p class="secondary">{t('roomList.new.searchFailed')}</p>
        {:else if !searching && !strangers.length && !known.length && !typedId}
          <p class="secondary">{t('roomList.new.nobodyFound')}</p>
        {/if}
      </section>
    {/if}
  </div>
  {#if failed}<p class="problem" role="alert">{t('roomAction.inviteFailed')}</p>{/if}
  <PrimaryButton wide busy={inviting} disabled={!chosen.length} onclick={() => void invite()}>
    {chosen.length ? t('room.invite.inviteCount', { count: chosen.length }) : t('room.manage.invite')}
  </PrimaryButton>
  <PlainButton onclick={onclose}>{t('room.manage.cancel')}</PlainButton>
</Dialog>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-close);
    max-height: var(--size-search-results);
    margin-block: var(--space-close);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
  }
  h3 {
    margin: 0;
    padding-inline: var(--space-normal);
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .secondary,
  .problem {
    margin: 0;
    padding-inline: var(--space-normal);
    font-size: var(--font-size-caption);
  }
  .secondary {
    color: var(--color-text-secondary);
  }
  .problem {
    color: var(--color-danger);
  }
</style>
