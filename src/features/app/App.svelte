<!-- Корень: какой экран — решает фаза приложения (`core/session/app.svelte.ts`). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../core/session/app.svelte.ts';
  import type { AuthCallback } from '../../core/auth/callback';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import Elsewhere from './Elsewhere.svelte';
  import Loading from './Loading.svelte';
  import UpdatePrompt from './UpdatePrompt.svelte';
  import { Lazy } from '../../design/lazy.svelte.ts';
  import { preferences } from './preferences.svelte.ts';
  import { wallpaperPhoto } from './wallpaperPhoto.svelte.ts';
  import { installScreenMotion } from './screenMotion';
  import { parseRoute } from '../../core/navigation/route';
  import { router } from '../../core/navigation/router.svelte.ts';

  let { authCallback }: { authCallback: AuthCallback | null } = $props();

  // Вошедшему не нужен вход, входящему — всё остальное: каждый экран своим чанком. Приложение
  // грузится, пока сессия поднимается (`loading`), — почти всегда это вошедший.
  const shell = new Lazy(() => import('./Shell.svelte'));
  const signIn = new Lazy(() => import('../signin/SignIn.svelte'));
  const recoveryScreen = new Lazy(() => import('../recovery/RecoveryScreen.svelte'));
  const verificationSheet = new Lazy(() => import('../recovery/VerificationSheet.svelte'));
  const Shell = $derived(shell.when(app.phase.name === 'loading' || app.phase.name === 'signed-in'));
  const SignIn = $derived(signIn.when(app.phase.name === 'signed-out'));
  const RecoveryScreen = $derived(recoveryScreen.when(app.phase.name === 'signed-in' && !!app.recoveryStep && !!app.phase.session.recovery));
  const VerificationSheet = $derived(verificationSheet.when(app.phase.name === 'signed-in' && !!app.phase.session.verification));

  /** Другая вкладка просит показаться. Фокус окно может не дать — тогда мигнуть заголовком. */
  function answerPing() {
    window.focus();
    if (document.visibilityState === 'visible') return;
    const original = document.title;
    let flip = false;
    const timer = setInterval(() => {
      flip = !flip;
      document.title = flip ? t('elsewhere.pinged') : original;
    }, 1000);
    const stop = () => {
      if (document.visibilityState !== 'visible') return;
      clearInterval(timer);
      document.title = original;
      document.removeEventListener('visibilitychange', stop);
    };
    document.addEventListener('visibilitychange', stop);
  }

  /** Чужая ссылка, открытая в другой вкладке, — здесь: вопрос (или чат) и просьба на неё взглянуть. */
  function openPassedLink(hash: string) {
    const route = parseRoute(hash);
    if (route.name !== 'open') return;
    router.go(route);
    answerPing();
  }

  onMount(() => {
    // Возврат со страницы входа читается один раз.
    void app.boot(authCallback, { onFocusRequested: answerPing, onLinkPassed: openPassedLink });
    const stopMotion = installScreenMotion();
    const stopPersisting = preferences.persist();
    return () => {
      stopMotion();
      stopPersisting();
    };
  });

  // Выход стёр своё фото на обоях с диска — и из памяти тоже: следующий здесь — другой человек.
  $effect(() => {
    if (app.phase.name === 'signed-out') wallpaperPhoto.forget();
  });

  $effect(() => {
    // Китайский — с письменностью: по `lang` браузер выбирает начертания иероглифов, и без
    // `Hans` они могли бы прийти из японского шрифта.
    document.documentElement.lang = i18n.locale === 'zh' ? 'zh-Hans' : i18n.locale;
    // Вошедшему заголовок ведёт `badge.svelte.ts` — с числом непрочитанных.
    if (app.phase.name !== 'signed-in') document.title = t('app.name');
  });
</script>

{#if app.phase.name === 'loading'}
  <Loading />
{:else if app.phase.name === 'signed-out'}
  {#if SignIn}<SignIn problem={app.phase.problem} detail={app.phase.detail} ended={app.phase.ended} />{:else}<Loading />{/if}
{:else if app.phase.name === 'elsewhere'}
  <Elsewhere />
{:else if app.recoveryStep && app.phase.session.recovery}
  {#if RecoveryScreen}
    <RecoveryScreen
      recovery={app.phase.session.recovery}
      verification={app.phase.session.verification}
      userId={app.phase.session.userId}
      ondone={() => app.finishRecovery()}
    />
  {:else}
    <Loading />
  {/if}
{:else if Shell}
  <Shell session={app.phase.session} />
{:else}
  <Loading />
{/if}

{#if app.phase.name === 'signed-in' && app.phase.session.verification && VerificationSheet}
  <VerificationSheet verification={app.phase.session.verification} />
{/if}

<UpdatePrompt />
