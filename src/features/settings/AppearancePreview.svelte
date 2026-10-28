<!--
  Как будет выглядеть переписка — над выбором вида, темы, цвета и обоев (`conversation` в
  `AppearanceView` нативной). Перерисовывается сразу: цвета и обои — те же переменные, что у
  ленты, на той же основе (`data-wallpaper`), так что показанное не врёт.

  В компактном виде пузырей нет — и предпросмотр это показывает: своя строка больше не выделена
  цветом, а у второй подряд от того же человека имени нет.

  Скринридеру — одной фразой: четыре пузыря выдуманного разговора по дороге к цветам ни к чему.
-->
<script lang="ts">
  import { t } from '../../i18n/index.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import Avatar from '../../design/Avatar.svelte';
  import WallpaperBackdrop from '../room/WallpaperBackdrop.svelte';

  /* Сиды лиц выдуманы и постоянны: лица не меняются от захода к заходу, и это не чей-то Matrix ID. */
  const SENDER_SEED = '@preview-sender:iskra.wtf';
  const OWN_SEED = '@preview-you:iskra.wtf';

  const lines = $derived([
    { text: t('appearance.previewAsk'), own: false, sender: t('appearance.previewSender'), seed: SENDER_SEED },
    { text: t('appearance.previewAnswer'), own: true, sender: t('message.spoken.you'), seed: OWN_SEED },
    { text: t('appearance.previewReply'), own: false, sender: t('appearance.previewSender'), seed: SENDER_SEED },
    { text: t('appearance.previewFollowUp'), own: false, sender: undefined, seed: undefined },
  ]);
</script>

<div
  class="preview"
  class:compact={preferences.layout === 'compact'}
  data-wallpaper={preferences.wallpaper === 'none' ? undefined : ''}
  role="img"
  aria-label={t('appearance.previewLabel')}
>
  <WallpaperBackdrop />
  {#each lines as line (line.text)}
    {#if preferences.layout === 'compact'}
      <span class="line">
        <!-- Без имени — пустая колонка ширины лица: серия выстраивается, как в комнате. -->
        <span class="face">
          {#if line.sender && line.seed}<Avatar name={line.sender} seed={line.seed} />{/if}
        </span>
        <span class="words">
          {#if line.sender}<span class="sender">{line.sender}</span>{/if}
          <span>{line.text}</span>
        </span>
      </span>
    {:else}
      <span class="bubble" class:own={line.own}>{line.text}</span>
    {/if}
  {/each}
</div>

<style>
  .preview {
    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-close);
    padding: var(--space-normal);
    border-radius: var(--radius-picture);
    background: var(--color-background);
    overflow: hidden;
  }
  .bubble {
    max-width: 80%;
    padding: var(--bubble-pad-y) var(--bubble-pad-x);
    border-radius: var(--radius-bubble);
    background: var(--color-incoming-bubble);
    color: var(--color-text);
  }
  .bubble.own {
    align-self: flex-end;
    background: var(--bubble-own);
    color: var(--on-bubble-own);
  }
  /* Зазор между строками (--space-close) равен --space-within-compact-run: серия в превью стоит так же, как в ленте. */
  .line {
    display: flex;
    align-items: flex-start;
    gap: var(--space-close);
  }
  .face {
    flex: none;
    width: var(--size-message-avatar);
    --avatar-size: var(--size-message-avatar);
  }
  .words {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
  }
  .sender {
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    font-weight: 500;
  }
  /* Над обоями слова — на подложке, как в ленте. */
  .compact[data-wallpaper] .line {
    padding: var(--space-tight) var(--space-close);
    border-radius: var(--radius-control);
    background: var(--color-incoming-bubble);
  }
</style>
