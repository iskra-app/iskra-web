<!--
  Меню сообщения — одно на ленту: правый щелчок, «ещё» по наведению, долгое нажатие.
  Сверху — шесть быстрых реакций и «+» — за ним все остальные (`EmojiPanel`): меню
  раскрывается в панель на том же месте. Под реакциями — действия, внизу — когда отправлено.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import { tick } from 'svelte';
  import Menu from '../../design/Menu.svelte';
  import type { Message } from '../../core/timeline/message';
  import { i18n, plural, t } from '../../i18n/index.svelte.ts';
  import type { MessageActions } from './actions';
  import { quickReactions } from './reactions';
  import { Lazy } from '../../design/lazy.svelte.ts';
  import { addRecent } from './recentEmoji';
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
  /** Пожаловаться можно на чужое и ушедшее: жалоба указывает на событие. */
  const reportable = $derived(!!message && !message.own && !!message.eventId);
  /** Точно, с датой и секундами: время у пузыря — только часы, а здесь — всё остальное. */
  const exactly = (ts: number) => new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(ts);
  /** Опрос, который ещё идёт и уже ушёл: в нём можно отозвать голос, а автору — закрыть. */
  const openPoll = $derived(message?.kind.type === 'poll' && !message.kind.poll.ended && !!message.eventId ? message.kind.poll : null);

  /** Открыта панель всех эмодзи вместо действий. Закрыли меню — в следующий раз снова ряд. */
  let picking = $state(false);
  // Каталог — несколько тысяч эмодзи; нужен тем, кому мало шести быстрых.
  const emojiPanel = new Lazy(() => import('./EmojiPanel.svelte'));
  const EmojiPanel = $derived(emojiPanel.when(picking));
  $effect(() => {
    if (!current) picking = false;
  });
  const mine = $derived(new Set(message?.reactions.filter((r) => r.mine).map((r) => r.key) ?? []));
  const reactionCount = $derived(message?.reactions.reduce((sum, r) => sum + r.count, 0) ?? 0);

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
    {#if EmojiPanel}<EmojiPanel {mine} recent={preferences.recentEmoji} onpick={react} />{/if}
  {:else if message && message.kind.type === 'deleted'}
    <!-- Удалённое: действий нет, а когда отправили и когда удалили — спрашивают именно у него. -->
    <p class="fact">{t('message.menu.sentAt', { time: exactly(message.ts) })}</p>
    {#if message.kind.at}<p class="fact">{t('message.menu.deletedAt', { time: exactly(message.kind.at) })}</p>{/if}
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
        <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.plus} /></svg>
      </button>
    </div>
    <!-- Группы, как в нативной: что делают с сообщением — красное, необратимое, — и факты. Между ними черта. -->
    {#if actions.showsReactors && reactionCount > 0}
      <!-- Первым: кто что поставил — единственный вопрос, на который пилюля с числом не отвечает. -->
      <button type="button" role="menuitem" onclick={() => run(actions.reactors)}>{plural('message.menu.reactors', reactionCount)}</button>
    {/if}
    {#if actions.canReply}
      <button type="button" role="menuitem" onclick={() => run(actions.reply)}>{t('message.menu.reply')}</button>
    {/if}
    {#if actions.openThread && actions.canReply && message.eventId && !message.threadRootId}
      <!-- В треде, а не в чате: тот же тред, что открывает строка под сообщением; нет его — начнётся. -->
      {@const open = actions.openThread}
      <button type="button" role="menuitem" onclick={() => run(open)}>{t('thread.replyInThread')}</button>
    {/if}
    {#if message.canEdit}
      <button type="button" role="menuitem" onclick={() => run(actions.edit)}>{t('message.menu.edit')}</button>
    {/if}
    {#if text}
      <button type="button" role="menuitem" onclick={() => run(() => void navigator.clipboard?.writeText(text).catch(() => {}))}>
        {t('message.menu.copy')}
      </button>
    {/if}
    {#if canForward(message)}
      <button type="button" role="menuitem" onclick={() => run(actions.forward)}>{t('message.menu.forward')}</button>
    {/if}
    {#if actions.stickerIsMine(message) !== undefined}
      <!-- Свой набор пополняется ссылкой: картинка уже на сервере, загружать нечего. -->
      <button type="button" role="menuitem" onclick={() => run(actions.toggleSticker)}>
        {actions.stickerIsMine(message) ? t('stickers.remove') : t('stickers.add')}
      </button>
    {/if}
    {#if actions.canPin}
      {#if message.pinned}
        <button type="button" role="menuitem" onclick={() => run(actions.unpin)}>{t('message.menu.unpin')}</button>
      {:else}
        <button type="button" role="menuitem" onclick={() => run(actions.pin)}>{t('message.menu.pin')}</button>
      {/if}
    {/if}
    {#if isSelectable(message)}
      <!-- Несколько сразу: скопировать одним куском, удалить пачку ошибок. -->
      <button type="button" role="menuitem" onclick={() => run(actions.select)}>{t('message.menu.select')}</button>
    {/if}
    {#if openPoll && openPoll.mine.length > 0}
      <!-- Пустой ответ — голоса нет (MSC3381). -->
      <button type="button" role="menuitem" onclick={() => run((m) => actions.vote(m, []))}>{t('poll.retract')}</button>
    {/if}
    {#if openPoll && message.own}
      <!-- Закрыть может только автор: конец от другого комната не признаёт. -->
      <button type="button" role="menuitem" onclick={() => run(actions.endPoll)}>{t('poll.end')}</button>
    {/if}
    {#if message.canDelete || reportable}
      <div class="rule" role="separator"></div>
      {#if message.canDelete}
        <button type="button" role="menuitem" class="danger" onclick={() => run(actions.remove)}>{t('message.menu.delete')}</button>
      {/if}
      {#if reportable}
        <!-- Чужое, ушедшее: жалоба указывает на событие на сервере. -->
        <button type="button" role="menuitem" class="danger" onclick={() => run(actions.report)}>{t('message.menu.report')}</button>
      {/if}
    {/if}
    {#if actions.viewSource}
      {@const view = actions.viewSource}
      <button type="button" role="menuitem" onclick={() => run(view)}>{t('beta.viewSource')}</button>
    {/if}
    <!-- Точно, с датой и секундами: время у пузыря — только часы, а здесь — всё остальное. -->
    <div class="rule" role="separator"></div>
    <p class="fact">{t('message.menu.sentAt', { time: exactly(message.ts) })}</p>
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
    fill: currentColor;
  }
  .reactions button.mine {
    background: var(--color-own-reaction);
  }
  .rule {
    margin-block: var(--space-tight);
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .fact {
    margin: 0;
    padding: var(--space-tight) var(--space-normal) 0;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
</style>
