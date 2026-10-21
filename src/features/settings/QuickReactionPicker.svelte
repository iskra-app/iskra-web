<!--
  «Быстрая реакция» — `ReactionsView` нативной Искры: шесть подсказок в одно касание и «+» —
  за ним весь каталог, та же `EmojiPanel`, что у меню сообщения: здесь нельзя выбрать то,
  чего сообщению не поставить. Выбранная не из шести встаёт в ряд последней, подсвеченной, —
  иначе у настройки не было бы видимого значения.

  `mine` в панели пуст нарочно: у сообщения это «уже поставленные — нажать, чтобы снять», а
  здесь снимать нечего, и подсвечена сама настройка — в ряду.
-->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import Icon from '../../design/Icon.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import { t } from '../../i18n/index.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import { Lazy } from '../../design/lazy.svelte.ts';
  import { quickReactions } from '../room/reactions';

  let { labelledby }: { labelledby: string } = $props();

  let picking = $state(false);
  const emojiPanel = new Lazy(() => import('../room/EmojiPanel.svelte'));
  const EmojiPanel = $derived(emojiPanel.when(picking));
  const nobody: ReadonlySet<string> = new Set();
  const choices = $derived(
    (quickReactions as readonly string[]).includes(preferences.quickReaction) ? [...quickReactions] : [...quickReactions, preferences.quickReaction],
  );

  function pick(emoji: string) {
    preferences.quickReaction = emoji;
    picking = false;
  }
</script>

<div class="row" role="radiogroup" aria-labelledby={labelledby}>
  {#each choices as emoji (emoji)}
    <button type="button" role="radio" class="emoji" aria-checked={preferences.quickReaction === emoji} onclick={() => (preferences.quickReaction = emoji)}>
      {emoji}
    </button>
  {/each}
  <button type="button" class="emoji more" aria-label={t('reactions.more')} title={t('reactions.more')} onclick={() => (picking = true)}>
    <Icon name="plus" />
  </button>
</div>

<Dialog open={picking} title={t('reactions.more')} onclose={() => (picking = false)}>
  {#if EmojiPanel}<EmojiPanel mine={nobody} recent={preferences.recentEmoji} onpick={pick} />{/if}
  <PlainButton onclick={() => (picking = false)}>{t('common.cancel')}</PlainButton>
</Dialog>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-close);
  }
  .emoji {
    display: grid;
    place-items: center;
    width: var(--tap-target);
    height: var(--tap-target);
    padding: 0;
    border: var(--border-hairline) solid transparent;
    border-radius: var(--radius-circle);
    background: transparent;
    font-size: var(--font-size-title);
    cursor: pointer;
  }
  /* Выбранная — в круге акцента; остальные ни на чём: ряд серых кругов читался бы как выключенные кнопки. */
  .emoji[aria-checked='true'] {
    border-color: var(--accent);
    background: var(--color-selected);
  }
  .more {
    background: var(--color-selected);
    color: var(--color-text-secondary);
  }
  .more :global(svg) {
    width: var(--size-icon);
    height: var(--size-icon);
  }
</style>
