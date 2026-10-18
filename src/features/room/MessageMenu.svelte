<!--
  Меню сообщения — одно на ленту: правый щелчок, «ещё» по наведению, долгое нажатие.
  Сверху — шесть быстрых реакций и «+» — за ним все остальные (`EmojiPanel`): меню
  раскрывается в панель на том же месте. Под реакциями — действия, внизу — когда отправлено.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Menu from '../../design/Menu.svelte';
  import { clock } from '../../design/time';
  import type { Message } from '../../core/timeline/message';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import type { MessageActions } from './actions';
  import { quickReactions } from './reactions';
  import EmojiPanel from './EmojiPanel.svelte';
  import { addRecent } from './emojiCatalog';
  import { preferences } from '../app/preferences.svelte.ts';
  import { isSelectable } from '../../core/timeline/selection';
  import { canForward } from '../../core/timeline/forward';

  interface Props {
    message: Message | null;
    at: { x: number; y: number };
    sheet: boolean;
    actions: MessageActions;
    onclose: () => void;
  }
  let { message: current, at, sheet, actions, onclose }: Props = $props();
  /**
   * Последнее, у кого открывали: закрывающееся меню догорает с ним, а не пустым. Синхронно, а не
   * эффектом: `Menu` меряет себя в миг открытия, и пустое меню не перевернулось бы над точкой.
   */
  let last: Message | null = null;
  const message = $derived.by(() => {
    if (current) last = current;
    return current ?? last;
  });

  const text = $derived(message && 'body' in message.kind ? message.kind.body : '');
  /** Опрос, который ещё идёт и уже ушёл: в нём можно отозвать голос, а автору — закрыть. */
  const openPoll = $derived(message?.kind.type === 'poll' && !message.kind.poll.ended && !!message.eventId ? message.kind.poll : null);

  /** Открыта панель всех эмодзи вместо действий. Закрыли меню — в следующий раз снова ряд. */
  let picking = $state(false);
  $effect(() => {
    if (!current) picking = false;
  });
  const mine = $derived(new Set(message?.reactions.filter((r) => r.mine).map((r) => r.key) ?? []));

  /** Реакция — и в недавние, откуда бы её ни поставили, как в нативной. */
  function react(emoji: string) {
    preferences.recentEmoji = addRecent(emoji, preferences.recentEmoji);
    run((m) => actions.react(m, emoji));
  }

  /** Пункт делает своё и закрывает меню — до действия: фокус вернётся туда, где был. */
  function run(action: (m: Message) => void) {
    const target = message;
    onclose();
    if (target) action(target);
  }
</script>

<Menu open={!!current} x={at.x} y={at.y} {sheet} label={t('message.menu.more')} {onclose}>
  {#if message && picking}
    <EmojiPanel {mine} recent={preferences.recentEmoji} onpick={react} />
  {:else if message}
    <div class="reactions" role="group" aria-label={t('message.menu.addReaction')}>
      {#each quickReactions as emoji (emoji)}
        {@const mine = message.reactions.some((r) => r.key === emoji && r.mine)}
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={mine}
          class:mine
          aria-label={mine ? t('message.menu.removeReaction') : t('message.menu.react', { emoji })}
          onclick={() => react(emoji)}>{emoji}</button
        >
      {/each}
      <button
        type="button"
        role="menuitem"
        class="more"
        aria-label={t('reactions.more')}
        title={t('reactions.more')}
        onclick={async () => {
          picking = true;
          // Фокус — в панель: её первая кнопка появится кадром позже.
          await tick();
          document.querySelector<HTMLElement>('.panel .cell')?.focus();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
    {#if actions.canReply}
      <button type="button" role="menuitem" onclick={() => run(actions.reply)}>{t('message.menu.reply')}</button>
    {/if}
    {#if openPoll && openPoll.mine.length > 0}
      <!-- Пустой ответ — голоса нет (MSC3381). -->
      <button type="button" role="menuitem" onclick={() => run((m) => actions.vote(m, []))}>{t('poll.retract')}</button>
    {/if}
    {#if openPoll && message.own}
      <!-- Закрыть может только автор: конец от другого комната не признаёт. -->
      <button type="button" role="menuitem" onclick={() => run(actions.endPoll)}>{t('poll.end')}</button>
    {/if}
    {#if message.canEdit}
      <button type="button" role="menuitem" onclick={() => run(actions.edit)}>{t('message.menu.edit')}</button>
    {/if}
    {#if text}
      <button type="button" role="menuitem" onclick={() => run(() => void navigator.clipboard?.writeText(text).catch(() => {}))}>
        {t('message.menu.copy')}
      </button>
    {/if}
    {#if actions.canPin}
      {#if message.pinned}
        <button type="button" role="menuitem" onclick={() => run(actions.unpin)}>{t('message.menu.unpin')}</button>
      {:else}
        <button type="button" role="menuitem" onclick={() => run(actions.pin)}>{t('message.menu.pin')}</button>
      {/if}
    {/if}
    {#if canForward(message)}
      <button type="button" role="menuitem" onclick={() => run(actions.forward)}>{t('message.menu.forward')}</button>
    {/if}
    {#if isSelectable(message)}
      <!-- Несколько сразу: скопировать одним куском, удалить пачку ошибок. -->
      <button type="button" role="menuitem" onclick={() => run(actions.select)}>{t('message.menu.select')}</button>
    {/if}
    {#if message.canDelete}
      <button type="button" role="menuitem" class="danger" onclick={() => run(actions.remove)}>{t('message.menu.delete')}</button>
    {/if}
    {#if !message.own}
      <button type="button" role="menuitem" class="danger" onclick={() => run(actions.block)}>{t('message.menu.block')}</button>
    {/if}
    <p class="sent">{t('message.menu.sentAt', { time: clock(message.ts, i18n.locale) })}</p>
  {/if}
</Menu>

<style>
  .reactions {
    display: flex;
    justify-content: space-between;
    gap: var(--space-tight);
    padding-block-end: var(--space-tight);
    margin-block-end: var(--space-tight);
    border-block-end: var(--border-hairline) solid var(--color-separator);
  }
  .reactions button {
    justify-content: center;
    min-width: var(--tap-target);
    padding: 0;
    border-radius: var(--radius-circle);
    font-size: var(--font-size-title);
  }
  .reactions .more {
    color: var(--color-text-secondary);
  }
  .more svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .reactions button.mine {
    background: var(--color-own-reaction);
  }
  .sent {
    margin: var(--space-tight) 0 0;
    padding: var(--space-tight) var(--space-normal) 0;
    border-block-start: var(--border-hairline) solid var(--color-separator);
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
</style>
