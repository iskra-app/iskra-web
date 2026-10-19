<!--
  «Новый опрос» — `PollComposer` нативной Искры: вопрос, два варианта для начала и новые по мере
  набора, два переключателя.

  Пустой вариант появляется под последним, как только в нём есть слова, как в Telegram, —
  кнопку «Добавить» для обычного случая искать не нужно; она остаётся для того, кто хочет
  добавить вариант до того, как начнёт печатать.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import QuietButton from '../../design/QuietButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import {
    canSendPoll,
    emptyPollDraft,
    MAX_POLL_ANSWERS,
    withAnswer,
    withoutAnswer,
    type PollDraft,
  } from '../../core/timeline/poll';
  import { t } from '../../i18n/index.svelte.ts';

  let { open, onsend, onclose }: { open: boolean; onsend: (draft: PollDraft) => void; onclose: () => void } = $props();

  let draft = $state<PollDraft>(emptyPollDraft());
  /** Вариант, добавленный кнопкой, — с фокусом; добавленный набором фокус не забирает. */
  let focusAnswer = $state(-1);

  $effect(() => {
    if (!open) return;
    draft = emptyPollDraft();
    focusAnswer = -1;
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!canSendPoll(draft)) return;
    onsend($state.snapshot(draft));
  }

  function add() {
    draft = { ...draft, answers: [...draft.answers, ''] };
    focusAnswer = draft.answers.length - 1;
  }
</script>

<Dialog {open} title={t('poll.newTitle')} {onclose}>
  <form onsubmit={submit}>
    <TextField bind:value={draft.question} label={t('poll.question')} showLabel placeholder={t('poll.questionPlaceholder')} autofocus />

    <fieldset>
      <legend>{t('poll.answers')}</legend>
      {#each draft.answers as answer, index (index)}
        <div class="answer">
          <TextField
            value={answer}
            label={`${t('poll.answerPlaceholder')} ${index + 1}`}
            placeholder={t('poll.answerPlaceholder')}
            autofocus={index === focusAnswer}
            oninput={(text: string) => (draft = withAnswer(draft, index, text))}
          />
          {#if draft.answers.length > 2}
            <button
              type="button"
              class="remove"
              aria-label={t('poll.removeAnswer')}
              title={t('poll.removeAnswer')}
              onclick={() => (draft = withoutAnswer(draft, index))}
            >
              <svg viewBox={ICON_VIEWBOX} aria-hidden="true">
                <path d={icons.removeCircle} />
              </svg>
            </button>
          {/if}
        </div>
      {/each}
      {#if draft.answers.length < MAX_POLL_ANSWERS}
        <div class="add"><QuietButton onclick={add}>{t('poll.addAnswer')}</QuietButton></div>
      {/if}
    </fieldset>

    <fieldset>
      <legend>{t('poll.settings')}</legend>
      <label class="toggle">
        <span>{t('poll.allowMultiple')}</span>
        <input type="checkbox" role="switch" bind:checked={draft.multipleChoice} />
      </label>
      <label class="toggle">
        <span>{t('poll.anonymous')}</span>
        <input type="checkbox" role="switch" bind:checked={draft.anonymous} />
      </label>
      {#if draft.anonymous}<p class="help">{t('poll.anonymousFooter')}</p>{/if}
    </fieldset>

    <PrimaryButton type="submit" wide disabled={!canSendPoll(draft)}>{t('poll.send')}</PrimaryButton>
    <PlainButton onclick={onclose}>{t('poll.cancel')}</PlainButton>
  </form>
</Dialog>

<style>
  form,
  fieldset {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: none;
  }
  legend {
    margin-block-end: var(--space-close);
    padding: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    font-weight: 600;
  }
  .answer {
    display: flex;
    align-items: center;
    gap: var(--space-close);
  }
  .answer > :global(:first-child) {
    flex: 1;
  }
  .remove {
    display: grid;
    place-items: center;
    width: var(--tap-target);
    height: var(--tap-target);
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .remove svg {
    width: var(--size-icon);
    height: var(--size-icon);
  }
  .add {
    align-self: flex-start;
  }
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-close);
    cursor: pointer;
  }
  .help {
    margin: 0;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
</style>
