<!--
  Опрос в ленте — `PollBubble` нативной Искры: вопрос, ответы и, когда есть что показать, как
  ответила комната.

  Голос — одним нажатием, без кнопки «Голосовать»: ответ на опрос заменяет прежний, так что
  промах ничего не стоит — нажмите другой. В опросе на несколько ответов нажатие ставит или
  снимает галочку. Отозвать голос — «Отменить голос» в меню сообщения.

  Полосы скрыты, пока не ответили (`showsResults`): видеть, куда клонится комната, до выбора —
  ровно то, чего автор опроса не хочет.
-->
<script lang="ts">
  import { choiceAfterTapping, isWinner, shareOf, showsResults } from '../../core/timeline/poll';
  import type { Poll } from '../../core/timeline/message';
  import { i18n, plural, t } from '../../i18n/index.svelte.ts';

  interface Props {
    poll: Poll;
    /** Нет ID (ещё не ушёл) — голосовать не во что. */
    canVote: boolean;
    /** Свой пузырь: акцент там уже фон, и полосы берут цвет текста. */
    own?: boolean;
    onvote: (answerIds: string[]) => void;
  }
  let { poll, canVote, own = false, onvote }: Props = $props();

  const single = $derived(poll.maxSelections <= 1);
  const results = $derived(showsResults(poll));
  const percent = $derived(new Intl.NumberFormat(i18n.locale, { style: 'percent', maximumFractionDigits: 0 }));

  const header = $derived(
    [poll.ended ? t('poll.ended') : poll.undisclosed ? t('poll.kindAnonymous') : t('poll.kind'), !single && !poll.ended ? t('poll.multiple') : '']
      .filter(Boolean)
      .join(' · '),
  );
  const footer = $derived.by(() => {
    if (poll.voters === 0) return t('poll.noVotes');
    const count = plural('poll.voters', poll.voters);
    return results ? count : `${count} · ${t('poll.hiddenUntilEnd')}`;
  });

  function choose(id: string) {
    const next = choiceAfterTapping(poll, id);
    if (next) onvote(next);
  }

  /** Доля — шириной полосы. Через CSSOM: атрибут `style` строгая CSP не пустит. */
  function width(node: HTMLElement, share: number) {
    const set = (value: number) => (node.style.width = `${value * 100}%`);
    set(share);
    return { update: set };
  }
</script>

<div class="poll" class:own>
  <span class="header">{header}</span>
  <strong class="question">{poll.question}</strong>
  <div class="answers" role={single ? 'radiogroup' : 'group'} aria-label={poll.question}>
    {#each poll.answers as answer (answer.id)}
      {@const chosen = poll.mine.includes(answer.id)}
      {@const share = shareOf(poll, answer)}
      <button
        type="button"
        class="answer"
        class:winner={isWinner(poll, answer)}
        role={single ? 'radio' : 'checkbox'}
        aria-checked={chosen}
        disabled={!canVote || poll.ended}
        onclick={() => choose(answer.id)}
      >
        <span class="marker" class:square={!single} class:chosen class:hidden={poll.ended && !chosen} aria-hidden="true">
          {#if chosen}<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12.5l4 4 8-9" /></svg>{/if}
        </span>
        <span class="text">{answer.text}</span>
        {#if results}
          <span class="share">{percent.format(share)}</span>
          <span class="bar" aria-hidden="true"><span class="fill" class:empty={share === 0} use:width={share}></span></span>
        {/if}
      </button>
    {/each}
  </div>
  <span class="footer">{footer}</span>
</div>

<style>
  .poll {
    --poll-fill: var(--accent);
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    width: var(--size-poll);
    max-width: 100%;
  }
  .poll.own {
    --poll-fill: currentColor;
  }
  .header,
  .footer {
    font-size: var(--font-size-caption);
    opacity: 0.7;
  }
  .answers {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
    margin-block: var(--space-close);
  }
  .answer {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-tight) var(--space-close);
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .answer:disabled {
    cursor: default;
  }
  .answer.winner .text {
    font-weight: 600;
  }
  .marker {
    display: grid;
    place-items: center;
    width: var(--size-icon);
    height: var(--size-icon);
    border: var(--border-thick) solid currentColor;
    border-radius: var(--radius-circle);
    opacity: 0.5;
  }
  .marker.square {
    border-radius: var(--radius-checkbox);
  }
  .marker.chosen {
    border-color: var(--poll-fill);
    background: var(--poll-fill);
    opacity: 1;
  }
  .marker.hidden {
    visibility: hidden;
  }
  .marker svg {
    width: 100%;
    height: 100%;
    stroke: var(--color-background);
  }
  .poll.own .marker svg {
    stroke: var(--accent);
  }
  .share {
    font-size: var(--font-size-caption);
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
  }
  .bar {
    grid-column: 2 / -1;
    height: var(--size-poll-bar);
    border-radius: var(--radius-circle);
    overflow: hidden;
  }
  .fill {
    display: block;
    min-width: var(--size-poll-bar);
    height: 100%;
    width: 0;
    border-radius: var(--radius-circle);
    background: var(--poll-fill);
  }
  .fill.empty {
    visibility: hidden;
  }
</style>
