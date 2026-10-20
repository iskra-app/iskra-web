<!--
  Устройства — `DevicesView` нативной: это устройство, «Активные сеансы» с последней активностью,
  «Завершить» у каждого и «Завершить все другие сеансы». Завершить — выйти из аккаунта на том
  устройстве. Где сеансы живут на сайте сервера (вход через MAS), «Завершить» открывает его на
  этом сеансе; иначе сервер может спросить пароль — тогда спрашиваем и мы.
-->
<script lang="ts">
  import ConfirmDialog from '../../design/ConfirmDialog.svelte';
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import type { AccountDevice, EndSessions, UserSession } from '../../core/session/userSession.svelte.ts';
  import { i18n, t } from '../../i18n/index.svelte.ts';

  let { session }: { session: UserSession } = $props();

  let devices = $state<AccountDevice[] | null>(null);
  let failed = $state(false);
  const load = () =>
    session.devices().then(
      (list) => ((devices = list), (failed = false)),
      () => (failed = !devices),
    );
  $effect(() => {
    void load();
  });

  const current = $derived(devices?.find((d) => d.current));
  const others = $derived(devices?.filter((d) => !d.current) ?? []);
  const managed = $derived(session.sessionsManagedByServer);

  /** Какие сеансы завершают — ждёт ответа на вопрос, потом, может быть, пароля. */
  let ending = $state<string[] | null>(null);
  /** «Завершить все другие» — свой вопрос, сколько бы их ни осталось. */
  let all = $state(false);
  let confirming = $state(false);
  let asking = $state(false);
  let password = $state('');
  let working = $state(false);
  let problem = $state<'endFailed' | 'wrongPassword' | null>(null);

  function ask(ids: string[], everyOther = false) {
    problem = null;
    all = everyOther;
    ending = ids;
    confirming = true;
  }

  async function end(withPassword?: string) {
    const ids = ending;
    if (!ids) return;
    working = true;
    const result: EndSessions = await session.endSessions(ids, withPassword);
    working = false;
    if (result === 'managed') {
      // На сайте сервера — там же, где входили: один сеанс — сразу на нём.
      const page = session.sessionEndPage(all ? undefined : ids[0]);
      if (page) window.open(page, '_blank', 'noopener,noreferrer');
      finish();
      return;
    }
    if (result === 'needsPassword' || result === 'wrongPassword') {
      problem = result === 'wrongPassword' ? 'wrongPassword' : null;
      password = '';
      asking = true;
      return;
    }
    if (result === 'failed') problem = 'endFailed';
    finish();
    void load();
  }

  function finish() {
    asking = false;
    password = '';
    ending = null;
  }

  const lastSeen = (ts: number) => new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(ts);
</script>

<section aria-labelledby="devices-title">
  <h3 id="devices-title">{t('devices.thisDevice')}</h3>
  {#if devices}
    {#if current}
      <ul class="list">
        <li>
          <strong>{current.name}</strong>
          <span class="secondary online">{t('devices.online')}</span>
        </li>
      </ul>
    {/if}
    {#if others.length}
      <PlainButton danger onclick={() => ask(others.map((d) => d.id), true)}>{t('devices.endOthers')}</PlainButton>
      <p class="secondary">{t('devices.endOthersFooter')}</p>
    {/if}
  {:else if failed}
    <p class="problem" role="alert">{t('settings.devicesFailed')}</p>
  {/if}
</section>

{#if devices}
  <section aria-labelledby="sessions-title">
    <h3 id="sessions-title">{t('devices.others')}</h3>
    {#if others.length}
      <ul class="list">
        {#each others as device (device.id)}
          <li class="row">
            <span class="what">
              <strong>{device.name}</strong>
              {#if device.lastSeen}<span class="secondary">{t('devices.lastSeen')}: {lastSeen(device.lastSeen)}</span>{/if}
              {#if device.ip}<span class="secondary">{t('devices.ipAddress')}: {device.ip}</span>{/if}
              <span class="secondary id">{device.id}</span>
            </span>
            <PlainButton danger onclick={() => ask([device.id])}>{t('devices.end')}</PlainButton>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="secondary">{t('devices.noOthers')}</p>
    {/if}
    {#if managed}<p class="secondary">{t('devices.managedFooter')}</p>{/if}
    {#if problem === 'endFailed'}<p class="problem" role="alert">{t('devices.endFailed')}</p>{/if}
  </section>
{/if}

<ConfirmDialog
  open={confirming}
  title={all ? t('devices.endOthersConfirm') : t('devices.endConfirm')}
  message=""
  confirmLabel={all ? t('devices.endOthers') : t('devices.end')}
  cancelLabel={t('devices.cancel')}
  destructive
  onclose={() => {
    confirming = false;
    if (!working && !asking) ending = null;
  }}
  onconfirm={() => {
    confirming = false;
    void end();
  }}
/>

<Dialog open={asking} title={t('devices.passwordTitle')} onclose={finish}>
  <form
    class="password"
    onsubmit={(event) => {
      event.preventDefault();
      void end(password);
    }}
  >
    <p class="secondary">{t('devices.passwordMessage')}</p>
    <TextField bind:value={password} label={t('devices.passwordField')} showLabel type="password" autocomplete="current-password" autofocus invalid={problem === 'wrongPassword'} />
    {#if problem === 'wrongPassword'}<p class="problem" role="alert">{t('devices.wrongPassword')}</p>{/if}
    <PrimaryButton type="submit" wide busy={working} disabled={!password}>{t('devices.end')}</PrimaryButton>
    <PlainButton onclick={finish}>{t('devices.cancel')}</PlainButton>
  </form>
</Dialog>

<style>
  /* Как у остальных групп «Настроек» (`Settings.svelte`): заголовок мелкими прописными, список карточкой. */
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  section > :global(*) {
    flex-shrink: 0;
  }
  /* Стили «Настроек» сюда не доходят — и их отступ между группами тоже: свой у каждой. */
  section {
    margin-block-start: var(--space-generous);
  }
  h3 {
    margin: var(--space-close) 0 0;
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
  }
  p {
    margin: 0;
  }
  .secondary {
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .problem {
    color: var(--color-danger);
    font-size: var(--font-size-caption);
  }
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    list-style: none;
  }
  .list li {
    display: flex;
    flex-direction: column;
    padding: var(--space-close) var(--space-normal);
  }
  .list li + li {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .list li.row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-normal);
  }
  .what {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .id {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .online {
    color: var(--accent);
  }
  .password {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
</style>
