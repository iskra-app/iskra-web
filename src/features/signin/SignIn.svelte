<!--
  Первое, что видит человек, — `SignInView` нативной Искры.

  Спрашиваем не «homeserver URL», а где живёт аккаунт. Поле пустое: matrix.org больше не
  подставляется сам — это делало выбор за всех, а из России он отвечает не всегда. Под полем —
  «Далее», «Не знаете, какой сервер выбрать?» и мелкой ссылкой «Что такое Matrix?». Сервер
  ответил — на том же месте две кнопки, «Войти» и «Создать аккаунт», и строка «Сервер: …» с
  «Изменить».

  «Войти» на сервере со своей страницей входа сразу уходит на неё. Форма с паролем — только
  там, где без неё никак, или для того, кто попросил её тихой фразой. В нативной эта фраза
  появляется, когда браузер закрыли на полпути; здесь страница уходит целиком и с отказом
  возвращается уже к адресу, поэтому фраза стоит под двумя кнопками.
-->
<script lang="ts">
  import { build, channel, otherChannelUrl, version, website } from '../app/channel';
  import { asset } from '../../design/asset';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import QuietButton from '../../design/QuietButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import ProblemPanel from '../../design/ProblemPanel.svelte';
  import { discoverServer, SignInError, type ServerInfo, type SignInProblem } from '../../core/auth/server';
  import { signInWithPassword, startOAuth, startSso } from '../../core/auth/signIn';
  import { app } from '../../core/session/app.svelte.ts';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import Icon from '../../design/Icon.svelte';
  import { languageChoices } from '../app/languages';
  import { preferences, type LanguageChoice } from '../app/preferences.svelte.ts';
  import AboutMatrix from './AboutMatrix.svelte';
  import ServerPicker from './ServerPicker.svelte';

  interface Props {
    problem?: SignInProblem | 'noRegistration';
    ended?: boolean;
  }
  let { problem: initialProblem, ended = false }: Props = $props();

  let address = $state('');
  let username = $state('');
  let password = $state('');
  let server = $state<ServerInfo | null>(null);
  /** Форма пароля: сервер другого входа не знает, или о ней попросили. */
  let usingPassword = $state(false);
  let busy = $state(false);
  let pending = $state<'signIn' | 'createAccount' | null>(null);
  let pickingServer = $state(false);
  let readingAboutMatrix = $state(false);
  // Пропы — только начальное значение: дальше экран ведёт их сам.
  // svelte-ignore state_referenced_locally
  let problem = $state<Props['problem']>(initialProblem);
  // svelte-ignore state_referenced_locally
  let showEnded = $state(ended);

  const problemKey = (p: NonNullable<Props['problem']>): TextKey => `signIn.problem.${p}`;
  const redirectWay = $derived(!!server && (!!server.oauth || server.sso));
  /** Имя сервера, как его видно на экране: что ввели, без схемы и косой черты. */
  const serverName = $derived(
    address
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, ''),
  );

  async function run(task: () => Promise<void>) {
    busy = true;
    problem = undefined;
    showEnded = false;
    try {
      await task();
    } catch (error) {
      problem = error instanceof SignInError ? error.problem : 'unreachable';
    } finally {
      busy = false;
      pending = null;
    }
  }

  function findServer(event: SubmitEvent) {
    event.preventDefault();
    if (!address.trim()) return;
    void run(async () => {
      server = await discoverServer(address, import.meta.env.DEV);
      if (server.username) username = server.username;
      usingPassword = false;
    });
  }

  function toBrowser(create: boolean) {
    const s = server;
    if (!s) return;
    pending = create ? 'createAccount' : 'signIn';
    void run(async () => {
      const url = s.oauth ? await startOAuth(s, { create }) : startSso(s);
      window.location.assign(url);
      // Страница уходит; кнопка остаётся занятой, пока не ушла.
      await new Promise(() => {});
    });
  }

  function signIn() {
    if (redirectWay) toBrowser(false);
    else usingPassword = true;
  }

  function createAccount() {
    if (!server?.canRegister) {
      problem = 'noRegistration';
      return;
    }
    toBrowser(true);
  }

  function submitPassword(event: SubmitEvent) {
    event.preventDefault();
    const s = server;
    if (!s || !username.trim() || !password) return;
    void run(async () => {
      const account = await signInWithPassword(s, username, password);
      password = '';
      await app.signIn(account);
    });
  }

  /** С формы — обратно к двум кнопкам: сервер тот же. */
  function back() {
    usingPassword = false;
    problem = undefined;
    password = '';
  }

  /** К адресу, чтобы его поменять. Введённое остаётся — его поправят, а не наберут снова. */
  function startOver() {
    server = null;
    usingPassword = false;
    problem = undefined;
    username = '';
    password = '';
  }
</script>

<main class="sign-in">
  <!-- Язык — до всего остального: человеку, которому браузер подсунул чужой, иначе не прочесть
       и того, где его поменять. Тот же выбор, что в настройках «Внешнего вида». -->
  <label class="language">
    <Icon name="language" />
    <select
      aria-label={t('settings.language')}
      value={preferences.language}
      onchange={(event) => (preferences.language = event.currentTarget.value as LanguageChoice)}
    >
      {#each languageChoices as language (language.value)}
        <option value={language.value}>{t(language.label)}</option>
      {/each}
    </select>
    <Icon name="down" />
  </label>
  <div class="content">
    {#if server && usingPassword}
      <form class="step" onsubmit={submitPassword}>
        <div class="back"><QuietButton disabled={busy} onclick={back}>{t('signIn.back')}</QuietButton></div>
        <h1 class="form-title">{t('signIn.signInTo', { name: serverName })}</h1>
        <p class="secondary">{t('signIn.passwordHelp')}</p>
        <TextField bind:value={username} label={t('signIn.username')} showLabel autocomplete="username" autofocus disabled={busy} />
        <TextField
          bind:value={password}
          label={t('signIn.password')}
          showLabel
          type="password"
          autocomplete="current-password"
          disabled={busy}
          invalid={problem === 'badCredentials'}
        />
        <PrimaryButton type="submit" wide {busy} disabled={!username.trim() || !password}>
          {redirectWay ? t('signIn.signInWithPassword') : t('signIn.signIn')}
        </PrimaryButton>
        {#if problem}
          <ProblemPanel message={t(problemKey(problem))} />
        {/if}
      </form>
    {:else}
      <header>
        <img src={asset('icons/icon.svg')} alt="" width="56" height="56" />
        <h1>{t('signIn.title')}</h1>
        <p class="secondary">{t('signIn.tagline')}</p>
      </header>

      {#if showEnded}
        <ProblemPanel title={t('session.ended.title')} message={t('session.ended.message')} />
      {/if}

      {#if !server}
        <form class="step" onsubmit={findServer}>
          <h2>{t('signIn.whereIsAccount')}</h2>
          <p class="secondary">{t('signIn.whereIsAccountHelp')}</p>
          <TextField
            bind:value={address}
            label={t('signIn.addressLabel')}
            placeholder={t('signIn.addressPlaceholder')}
            inputmode="url"
            autocomplete="url"
            autofocus
            disabled={busy}
            invalid={!!problem}
          />
          {#if problem}
            <ProblemPanel message={t(problemKey(problem))} />
          {/if}
          <PrimaryButton type="submit" wide {busy} disabled={!address.trim()}>{t('signIn.next')}</PrimaryButton>
          <PlainButton disabled={busy} onclick={() => (pickingServer = true)}>{t('signIn.chooseServer')}</PlainButton>
          <button type="button" class="small-link" onclick={() => (readingAboutMatrix = true)}>{t('signIn.whatIsMatrix')}</button>
        </form>
      {:else}
        <div class="step">
          {#if problem}
            <ProblemPanel message={t(problemKey(problem))} />
          {/if}
          <PrimaryButton wide busy={pending === 'signIn'} disabled={busy} onclick={signIn}>{t('signIn.signIn')}</PrimaryButton>
          <PlainButton busy={pending === 'createAccount'} disabled={busy} onclick={createAccount}>{t('signIn.createAccount')}</PlainButton>
          {#if redirectWay && server.password}
            <button type="button" class="small-link" disabled={busy} onclick={() => (usingPassword = true)}>
              {t('signIn.usePasswordInstead')}
            </button>
          {/if}
          <p class="server">
            <span class="secondary">{t('signIn.server', { name: serverName })}</span>
            <button type="button" class="change" disabled={busy} onclick={startOver}>{t('signIn.changeServer')}</button>
          </p>
        </div>
      {/if}
    {/if}
  </div>
  <!-- Какая это сборка, ссылка на другую (с ночной на стабильную, со стабильной на ночную)
       и сайт Искры — в любой. -->
  <footer class="build">
    {#if channel === 'nightly'}<span class="badge">{t('signIn.nightlyBadgeWeb')}</span>{/if}
    <span>{t('signIn.versionWeb', { version, build })}</span>
    <a href={otherChannelUrl}>{channel === 'nightly' ? t('signIn.openStableWeb') : t('signIn.openNightlyWeb')}</a>
    <a href={website.href} target="_blank" rel="noopener noreferrer">{website.label}</a>
  </footer>
</main>

<ServerPicker
  open={pickingServer}
  onpick={(picked) => {
    address = picked;
    pickingServer = false;
  }}
  onclose={() => (pickingServer = false)}
/>
<AboutMatrix open={readingAboutMatrix} onclose={() => (readingAboutMatrix = false)} />

<style>
  .sign-in {
    display: flex;
    flex-direction: column;
    gap: var(--space-generous);
    width: 100%;
    max-width: var(--size-sign-in-column);
    min-height: 100%;
    margin-inline: auto;
    padding: var(--space-generous);
    padding-block-start: max(var(--space-generous), env(safe-area-inset-top));
  }
  /* Блок входа — посередине высоты: свободное место делится поровну над ним и под ним, подвал
     остаётся внизу. */
  .content {
    display: flex;
    flex-direction: column;
    gap: var(--space-generous);
    margin-block: auto;
    animation: entrance var(--timing-entrance) var(--ease-entrance) both;
  }
  @keyframes entrance {
    from {
      opacity: 0;
      filter: blur(var(--blur-entrance));
      transform: scale(var(--scale-entrance));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .content {
      animation: none;
    }
  }
  .language {
    position: relative;
    display: inline-flex;
    align-items: center;
    align-self: center;
    gap: var(--space-tight);
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .language :global(svg) {
    flex: none;
    width: var(--size-icon);
    height: var(--size-icon);
  }
  /* Стрелка — поверх края списка, нажатие проходит сквозь неё. */
  .language :global(svg:last-child) {
    margin-inline-start: calc(-1 * var(--size-icon) - var(--space-tight));
    pointer-events: none;
  }
  .language select {
    appearance: none;
    /* Ширина — по выбранному, а не по самому длинному варианту: стрелка стоит вплотную к слову. */
    field-sizing: content;
    min-height: var(--tap-target);
    padding-block: 0;
    padding-inline: var(--space-tight) var(--size-icon);
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-normal);
    padding-block-start: var(--space-generous);
    text-align: center;
  }
  header img {
    width: var(--size-sign-in-mark);
    height: var(--size-sign-in-mark);
  }
  h1 {
    margin: 0;
    font-size: var(--font-size-large-title);
    text-wrap: balance;
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-body);
    font-weight: 600;
  }
  .step {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  .back {
    margin-inline-start: calc(-1 * var(--space-close));
  }
  .secondary {
    margin: 0;
    color: var(--color-text-secondary);
  }
  .small-link,
  .change {
    padding: var(--space-tight);
    border: none;
    background: transparent;
    font: inherit;
    font-size: var(--font-size-caption);
    cursor: pointer;
  }
  .small-link {
    align-self: center;
    margin-block-start: var(--space-close);
    color: var(--color-text-secondary);
  }
  .small-link:disabled,
  .change:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .server {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: baseline;
    gap: var(--space-tight);
    margin: 0;
    margin-block-start: var(--space-close);
    font-size: var(--font-size-caption);
  }
  .change {
    padding: 0;
    color: var(--accent);
  }
  .build {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: var(--space-tight) var(--space-close);
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    text-align: center;
  }
  .build a {
    color: var(--accent);
  }
  .badge {
    padding: 0 var(--space-close);
    border-radius: var(--radius-circle);
    background: var(--color-warning);
    color: var(--color-on-danger);
    font-weight: 600;
  }
</style>
