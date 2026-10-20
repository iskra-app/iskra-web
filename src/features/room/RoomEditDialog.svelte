<!--
  «Изменить чат» — `RoomEditView` нативной: название, описание, фото, открытость, история для
  новых участников, адрес и каталог сервера, заблокированные — только то, на что есть право.
  Фото чата уходит открыто: оно в состоянии комнаты, которое Matrix не шифрует.

  Личный чат — другое: его имя, описание и фото принадлежат собеседнику, и менять их так,
  что он это прочтёт, мы не предлагаем. Там одно поле — как вы зовёте человека на этом
  устройстве (`LocalNames`); сервер о нём не знает, поэтому и без сети оно работает.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import ConfirmDialog from '../../design/ConfirmDialog.svelte';
  import { addressName, historyChoices, type HistoryAccess, type MemberSummary, type RoomDetailsStore } from '../../core/rooms/roomDetails.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import { roomFailureText } from './text';

  let { open, details, session, onclose }: { open: boolean; details: RoomDetailsStore; session: UserSession; onclose: () => void } = $props();

  let name = $state('');
  let localName = $state('');
  let topic = $state('');
  let isOpen = $state(false);
  let history = $state<HistoryAccess>('shared');
  let address = $state('');
  let listed = $state(false);
  /** Кого пускают обратно — ждёт ответа на вопрос. */
  let unbanning = $state<MemberSummary | null>(null);
  const historyKey = (h: HistoryAccess) => (h === 'world_readable' ? 'room.access.history.worldReadable' : (`room.access.history.${h}` as const));
  let picker: HTMLInputElement | undefined = $state();
  const id = $props.id();

  // Открыли — поля заполняются тем, что сейчас; правки прошлого раза не висят. Только в миг
  // открытия: пока окно сохраняет, комната меняется (история уже ушла), и перечитать поля тогда —
  // стереть то, что человек ещё только сохраняет.
  $effect(() => {
    if (!open) return;
    untrack(() => {
      name = details.serverName;
      localName = details.localName ?? '';
      topic = details.topic;
      isOpen = details.open;
      history = details.history;
      address = details.addressName;
      if (details.permissions.canChangeAddress) void details.loadDirectory();
    });
  });
  // Сервер ответил про каталог — переключатель встаёт как есть.
  $effect(() => {
    if (open && details.inDirectory !== undefined) listed = details.inDirectory;
  });

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (details.direct) {
      // Дождаться записи: закрытая сразу вкладка не должна терять имя.
      await details.renameLocally(localName);
      onclose();
      return;
    }
    const p = details.permissions;
    const done =
      (!p.canRename || (await details.rename(name))) &&
      (!p.canChangeTopic || (await details.setTopic(topic))) &&
      (!p.canChangeVisibility || (await details.setOpen(isOpen))) &&
      (!p.canChangeHistory || (await details.setHistory(historyChoices(isOpen).includes(history) ? history : 'shared'))) &&
      (!p.canChangeAddress || (await details.setAddress(address))) &&
      (!p.canChangeAddress || details.inDirectory === undefined || !isOpen || listed === details.inDirectory || (await details.setInDirectory(listed)));
    if (done) onclose();
  }

  async function picked() {
    const file = picker?.files?.[0];
    if (picker) picker.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const mxc = await session.uploadPublic(file, file.name, file.type);
      await details.setPicture(mxc);
    } catch {
      details.failure = 'picture';
    }
  }
</script>

<Dialog {open} title={t('room.manage.editTitle')} {onclose}>
  <form onsubmit={save}>
    {#if details.direct}
      <TextField bind:value={localName} label={t('room.localName.header')} showLabel placeholder={details.serverName} />
      <p class="help">{t('room.localName.help')}</p>
      {#if details.localName}
        <PlainButton
          onclick={async () => {
            await details.renameLocally(null);
            onclose();
          }}>{t('room.localName.reset')}</PlainButton
        >
      {/if}
    {:else}
      {#if details.permissions.canChangePicture}
        <div class="picture">
          <PlainButton onclick={() => picker?.click()}>{t('room.manage.changePicture')}</PlainButton>
          {#if details.avatarUrl}
            <PlainButton danger onclick={() => void details.setPicture(null)}>{t('room.manage.removePicture')}</PlainButton>
          {/if}
          <input bind:this={picker} type="file" accept="image/*" hidden onchange={picked} />
        </div>
      {/if}
      {#if details.permissions.canRename}
        <TextField bind:value={name} label={t('room.manage.nameHeader')} showLabel placeholder={t('room.manage.namePlaceholder')} />
      {/if}
      {#if details.permissions.canChangeTopic}
        <div class="field">
          <label for="{id}-topic">{t('room.about')}</label>
          <textarea id="{id}-topic" bind:value={topic} rows="3" placeholder={t('room.manage.topicPlaceholder')}></textarea>
        </div>
      {/if}
      {#if details.permissions.canChangeVisibility}
        <label class="toggle">
          <span>
            <strong>{t('room.manage.openToAnyone')}</strong>
            <span class="help">{t('room.manage.openToAnyoneHelp')}</span>
            {#if isOpen && details.encrypted}<span class="help">{t('roomList.new.openMeansUnencrypted')}</span>{/if}
          </span>
          <input type="checkbox" role="switch" bind:checked={isOpen} />
        </label>
      {/if}
      {#if details.permissions.canChangeHistory}
        <fieldset class="field">
          <legend>{t('room.access.historyHeader')}</legend>
          <div class="choices" role="radiogroup" aria-label={t('room.access.historyHeader')}>
            {#each historyChoices(isOpen) as choice (choice)}
              <label class="choice"><input type="radio" name="{id}-history" value={choice} bind:group={history} />{t(historyKey(choice))}</label>
            {/each}
          </div>
          <span class="help">{t('room.access.historyFooter')}</span>
        </fieldset>
      {/if}
      {#if details.permissions.canChangeAddress}
        <TextField bind:value={address} label={t('room.access.addressHeader')} showLabel placeholder={t('room.access.addressPlaceholder')} />
        <span class="help">
          {#if addressName(address)}<span class="address">#{addressName(address)}:{details.addressServer}</span><br />{/if}
          {t('room.access.addressFooter')}
        </span>
        {#if isOpen && details.inDirectory !== undefined}
          <label class="toggle">
            <span>
              <strong>{t('room.access.inDirectory')}</strong>
              <span class="help">{t('room.access.inDirectoryHelp', { server: details.addressServer })}</span>
            </span>
            <input type="checkbox" role="switch" bind:checked={listed} />
          </label>
        {/if}
      {/if}
      {#if details.permissions.canBan && details.banned.length > 0}
        <fieldset class="field">
          <legend>{t('room.access.banned')}</legend>
          <ul class="banned">
            {#each details.banned as member (member.id)}
              <li>
                <span class="who">{member.name}</span>
                <PlainButton onclick={() => (unbanning = member)}>{t('room.access.unban')}</PlainButton>
              </li>
            {/each}
          </ul>
          <span class="help">{t('room.access.bannedFooter')}</span>
        </fieldset>
      {/if}
    {/if}
    {#if details.failure}
      <p class="problem" role="alert">{roomFailureText(details.failure)}</p>
    {/if}
    <PrimaryButton type="submit" wide busy={details.working}>{t('room.manage.save')}</PrimaryButton>
    <PlainButton onclick={onclose}>{t('room.manage.cancel')}</PlainButton>
  </form>
</Dialog>

<ConfirmDialog
  open={!!unbanning}
  title={t('room.access.unbanQuestion', { name: unbanning?.name ?? '' })}
  message={t('room.access.unbanHelp')}
  confirmLabel={t('room.access.unban')}
  cancelLabel={t('room.manage.cancel')}
  onclose={() => (unbanning = null)}
  onconfirm={() => {
    if (unbanning) void details.unban(unbanning);
    unbanning = null;
  }}
/>

<style>
  fieldset {
    margin: 0;
    padding: 0;
    border: none;
  }
  legend {
    padding: 0;
    margin-block-end: var(--space-tight);
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .choices {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    overflow: hidden;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    font-size: var(--font-size-body);
    color: var(--color-text);
    cursor: pointer;
  }
  .choice + .choice {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .address {
    color: var(--color-text);
  }
  .banned {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .banned li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-close);
  }
  .who {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  .picture {
    display: grid;
    grid-auto-flow: column;
    gap: var(--space-close);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
  }
  label {
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  textarea {
    padding: var(--space-normal) var(--space-roomy);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-control);
    background: var(--color-background);
    resize: vertical;
  }
  textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 0;
    border-color: transparent;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    color: var(--color-text);
    font-size: var(--font-size-body);
    cursor: pointer;
  }
  .toggle > span {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-tight);
  }
  .help {
    margin: 0;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .problem {
    margin: 0;
    color: var(--color-danger);
    font-size: var(--font-size-caption);
  }
</style>
