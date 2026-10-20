<!--
  «Новый вход в аккаунт — это вы?» над списком чатов — `NewSignInBanner` нативной. Как считается
  «новый» — `core/session/newSignIns.svelte.ts`.

  Два ответа, оба одним нажатием. «Да, это я» запоминает сеанс, и полоса уходит. «Это не я» ведёт
  в «Безопасность», к сеансу с «Завершить», а не завершает на месте: может понадобиться пароль или
  сайт сервера, и тот, кто увидел чужого в своём аккаунте, должен видеть, что завершает.
-->
<script lang="ts">
  import type { AccountDevice } from '../../core/session/userSession.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';

  interface Props {
    device: AccountDevice;
    /** Сколько ещё новых за этим. */
    more: number;
    onconfirm: () => void;
    ondeny: () => void;
  }
  let { device, more, onconfirm, ondeny }: Props = $props();

  const summary = $derived([device.name, device.ip].filter(Boolean).join(' · '));
</script>

<div class="banner" role="region" aria-label={t('devices.newSignInTitle')}>
  <strong>{t('devices.newSignInTitle')}</strong>
  <span class="secondary">{summary}</span>
  {#if more > 0}<span class="secondary">{t('devices.newSignInMore', { count: more })}</span>{/if}
  <span class="answers">
    <button type="button" onclick={onconfirm}>{t('devices.newSignInYes')}</button>
    <button type="button" class="deny" onclick={ondeny}>{t('devices.newSignInNo')}</button>
  </span>
</div>

<style>
  .banner {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    margin: var(--space-close);
    padding: var(--space-normal) var(--space-roomy);
    border-radius: var(--radius-card);
    background: color-mix(in srgb, var(--color-danger) var(--warning-wash), var(--color-background));
  }
  .secondary {
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .answers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-normal);
    margin-block-start: var(--space-close);
  }
  button {
    min-height: var(--tap-target);
    border: none;
    border-radius: var(--radius-control);
    background: var(--color-surface);
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .deny {
    color: var(--color-danger);
  }
</style>
