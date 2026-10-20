<!--
  Жалоба на сообщение — `ReportSheet` нативной. Уходит модераторам сервера, не нам: приложение
  жалобу не разбирает и не должно делать вид, что разбирает. Причина необязательна — требовать
  фразу значит дать повод не жаловаться.
-->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import type { Message } from '../../core/timeline/message';
  import { t } from '../../i18n/index.svelte.ts';

  interface Props {
    /** На что жалуются; `null` — окно закрыто. */
    message: Message | null;
    onreport: (message: Message, reason: string) => void;
    onclose: () => void;
  }
  let { message, onreport, onclose }: Props = $props();

  let reason = $state('');
  $effect(() => {
    if (!message) reason = '';
  });
</script>

<Dialog open={!!message} title={t('message.report.title')} {onclose}>
  {#if message}
    <div class="report">
      <TextField bind:value={reason} label={t('message.report.reasonPrompt')} placeholder={t('message.report.reasonPrompt')} autofocus />
      <p class="secondary">{t('message.report.explanation')}</p>
      <PrimaryButton
        onclick={() => {
          onreport(message, reason.trim());
          onclose();
        }}>{t('message.report.submit')}</PrimaryButton
      >
      <PlainButton onclick={onclose}>{t('message.report.cancel')}</PlainButton>
    </div>
  {/if}
</Dialog>

<style>
  .report {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  .secondary {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
</style>
