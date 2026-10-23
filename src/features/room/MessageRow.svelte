<!--
  Одна строка ленты: пузырь, служебная строка или разделитель дней.

  Пузырь — непрозрачная заливка (стекло — только в навигационном слое). Своё — справа, в
  акценте; чужое — слева, нейтральной заливкой. В группе у первой строки серии — имя, у
  последней — лицо; в личном чате ни того, ни другого: и так понятно, кто говорит.

  Компактный вид (`CompactMessageRow` нативной Искры) — те же строки без пузырей и без
  сторон: своё выглядит как чужое, и имя над серией — единственное, что говорит, кто
  пишет. Поэтому имя и лицо — всегда, в личном чате тоже, у *первой* строки серии; время —
  у каждой строки, а не в шапке: серия может длиться час.

  Действия (см. план, «Ввод»): с мышью — панель по наведению (реакция, ответ, «ещё») и то же
  меню по правому щелчку; пальцем — долгое нажатие (браузер присылает его как
  `contextmenu`), двойное касание — быстрая реакция, свайп вправо — ответить. Над ссылкой и
  выделенным текстом правый щелчок остаётся браузеру: его меню там нужнее нашего.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import Avatar from '../../design/Avatar.svelte';
  import { clock } from '../../design/time';
  import { viewport } from '../../design/viewport.svelte.ts';
  import type { Message } from '../../core/timeline/message';
  import { i18n, plural, t } from '../../i18n/index.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import type { MessageActions } from './actions';
  import { touchGestures } from './gestures';
  import { matrixHtml } from './html';
  import LinkedText from './LinkedText.svelte';
  import PollView from './PollView.svelte';
  import LocationCard from './LocationCard.svelte';
  import FileCard from '../media/FileCard.svelte';
  import VoiceMessage from '../media/VoiceMessage.svelte';
  import MediaPreview from '../media/MediaPreview.svelte';
  import AlbumView from './AlbumView.svelte';
  import ThreadLine from './ThreadLine.svelte';
  import type { MediaLoader } from '../../core/media/media';
  import { attachmentLabel, serviceText } from './text';

  interface Props {
    message: Message;
    firstInRun: boolean;
    lastInRun: boolean;
    /** Группа: показывать имена и лица собеседников. */
    showSenders: boolean;
    senderPhoto?: string;
    actions: MessageActions;
    media: MediaLoader;
  }
  let { message, firstInRun, lastInRun, showSenders, senderPhoto, actions, media }: Props = $props();

  const compact = $derived(preferences.layout === 'compact');
  /** Колонка лиц: в компактном — у всех, в пузырях — у собеседников в группе. */
  const withFace = $derived(compact || (showSenders && !message.own));
  const faceHere = $derived(compact ? firstInRun : lastInRun);
  const nameHere = $derived(firstInRun && withFace);
  const kind = $derived(message.kind);
  const failed = $derived(message.delivery.state === 'failed' ? message.delivery : null);
  /** С ушедшим можно что-то делать; с удалённым и служебным — нет. */
  const interactive = $derived(!!message.eventId && kind.type !== 'deleted' && kind.type !== 'service');
  /** Меню — и у удалённого: действий в нём нет, но когда отправили и когда удалили — есть. */
  const hasMenu = $derived(!!message.eventId && kind.type !== 'service');
  /** Картинка во весь пузырь: отступы пузыря — тоньше, фон — у самой картинки. */
  const visual = $derived(kind.type === 'image' || kind.type === 'video' || kind.type === 'videoNote' || kind.type === 'sticker');

  const selected = () => (window.getSelection()?.toString() ?? '') !== '';

  /**
   * Было ли выделение до правого щелчка. Safari на Mac выделяет слово под курсором сам, ещё до
   * `contextmenu`, — и по выделению «сейчас» наше меню там не открывалось бы никогда.
   */
  let selectedBefore: boolean | null = null;
  function onpointerdown(event: PointerEvent) {
    selectedBefore = event.button === 2 ? selected() : null;
  }

  function oncontextmenu(event: MouseEvent) {
    if (!hasMenu) return;
    const target = event.target as Element | null;
    const hadSelection = selectedBefore ?? selected();
    selectedBefore = null;
    if (target?.closest('a') || hadSelection) return;
    event.preventDefault();
    // Слово, выделенное браузером на правый щелчок, — не выбор человека: снять.
    if (selected()) window.getSelection()?.removeAllRanges();
    actions.openMenu(message, { x: event.clientX, y: event.clientY }, !viewport.finePointer);
  }

  function more(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    actions.openMenu(message, { x: rect.left, y: rect.bottom }, !viewport.finePointer);
  }

  /**
   * Панель по наведению — сбоку от пузыря, пока сбоку есть место. У широкого пузыря его нет:
   * панель уходила за край ленты, и «ещё» было не нажать. Тогда — на верхний край пузыря, у
   * его дальнего угла. Меряется при наведении: ширина колонки меняется, и запомнить нельзя.
   */
  let hoverBar: HTMLElement | undefined = $state();
  let barInside = $state(false);
  function placeHoverBar() {
    const bar = hoverBar;
    const wrap = bar?.parentElement;
    if (!bar || !wrap) return;
    // Край — у прокрутки ленты: она обрезает всё, что шире неё.
    const clip = (bar.closest('[role="log"]')?.parentElement ?? document.documentElement).getBoundingClientRect();
    const around = wrap.getBoundingClientRect();
    const toLeft = (message.own && !compact) !== (getComputedStyle(wrap).direction === 'rtl');
    const room = toLeft ? around.left - clip.left : clip.right - around.right;
    const style = getComputedStyle(bar);
    const gap = (parseFloat(style.marginInlineStart) || 0) + (parseFloat(style.marginInlineEnd) || 0);
    barInside = room < bar.offsetWidth + gap;
  }

  const gestures = $derived({
    ondoubletap: () => interactive && actions.react(message, preferences.quickReaction),
    onswipe: () => interactive && actions.canReply && actions.reply(message),
    onlongpress: (at: { x: number; y: number }) => hasMenu && actions.openMenu(message, at, true),
  });
</script>

{#if kind.type === 'service'}
  <p class="service">{serviceText(kind.event)}</p>
{:else}
  <!-- Наведение и фокус здесь только ставят панель на место (`placeHoverBar`); действий нет. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="row"
    class:own={message.own && !compact}
    class:compact
    class:first={firstInRun}
    class:grouped={withFace}
    class:interactive
    onpointerenter={placeHoverBar}
    onfocusin={placeHoverBar}
  >
    {#if withFace}
      <!-- Лицо и имя ведут на страницу человека. Мышью и пальцем; скринридеру и Tab — через
           список участников в «О чате»: сотня одинаковых остановок в ленте ему не нужна. -->
      <span class="face">
        {#if faceHere}
          {#if actions.openProfile}
            {@const open = actions.openProfile}
            <button type="button" class="to-profile" tabindex="-1" aria-hidden="true" onclick={() => open(message.senderId)}>
              <Avatar name={message.senderName} seed={message.senderId} photo={senderPhoto} mode={preferences.faces} />
            </button>
          {:else}
            <Avatar name={message.senderName} seed={message.senderId} photo={senderPhoto} mode={preferences.faces} />
          {/if}
        {/if}
      </span>
    {/if}
    <div class="stack">
      {#if nameHere}
        <!-- Видимое имя — для глаз; скринридеру его говорит само сообщение, у каждого. -->
        {#if actions.openProfile}
          {@const open = actions.openProfile}
          <button type="button" class="sender to-profile" tabindex="-1" aria-hidden="true" onclick={() => open(message.senderId)}>{message.senderName}</button>
        {:else}
          <span class="sender" aria-hidden="true">{message.senderName}</span>
        {/if}
      {/if}
      <div class="bubble-wrap">
      <!-- Пузырь — `article`: запись в `role="log"` ленты и её остановка с клавиатуры
           (`rovingFocus.ts`): стрелки ходят по сообщениям, Enter открывает меню. -->
      <div
        data-row-stop
        class="bubble"
        class:visual
        class:bare={kind.type === 'sticker' || kind.type === 'videoNote'}
        role="article"
        class:notice={kind.type === 'notice'}
        class:deleted={kind.type === 'deleted'}
        class:muted={kind.type === 'deleted' || kind.type === 'unreadable' || kind.type === 'unsupported'}
        {oncontextmenu}
        {onpointerdown}
        use:touchGestures={gestures}
      >
        <!-- Кто говорит — скринридеру, в начале каждого сообщения (`spokenLabel` нативной Искры):
             в личном чате и у своих имени на экране нет, а в группе оно есть только над серией. -->
        <span class="visually-hidden">{message.own ? t('message.spoken.you') : message.senderName}: </span>
        {#if message.forwarded}
          <!-- Пересланное говорит, что оно пересланное, — и от кого, только если пометка называет. -->
          <span class="forwarded">
            {message.forwarded.name ? t('message.forwardedFrom', { name: message.forwarded.name }) : t('message.forwarded')}
          </span>
        {/if}
        {#if message.replyTo}
          <span class="quote">
            {#if message.replyTo.senderName}<strong>{message.replyTo.senderName}</strong>{/if}
            {#if message.replyTo.text}<span>{message.replyTo.text}</span>{/if}
          </span>
        {/if}
        <span class="content">
          {#if (kind.type === 'text' || kind.type === 'notice') && kind.html}
            <span class="html" use:matrixHtml={kind.html}></span>
          {:else if kind.type === 'text' || kind.type === 'notice'}
            <span class="text"><LinkedText text={kind.body} /></span>
          {:else if kind.type === 'emote' && kind.html}
            <em>* {message.senderName}&#32;<span class="html" use:matrixHtml={kind.html}></span></em>
          {:else if kind.type === 'emote'}
            <em>* {message.senderName}&#32;<LinkedText text={kind.body} /></em>
          {:else if kind.type === 'deleted'}
            <em>{t('message.deleted')}</em>
          {:else if kind.type === 'unreadable'}
            <em>{t('message.unreadable')}</em>
          {:else if kind.type === 'unsupported'}
            <em>{t('message.unsupported')}</em>
          {:else if kind.type === 'poll'}
            <PollView poll={kind.poll} canVote={!!message.eventId} own={message.own && !compact} onvote={(ids) => actions.vote(message, ids)} />
          {:else if message.album}
            {@const albumCaption = (kind.type === 'image' || kind.type === 'video') && kind.attachment.caption ? kind.attachment.caption : ''}
            <AlbumView items={message.album} {media} captioned={!!albumCaption} onopen={(item) => actions.openMedia(item)} />
            {#if albumCaption}<span class="caption album-caption text"><LinkedText text={albumCaption} /></span>{/if}
          {:else if kind.type === 'image' || kind.type === 'video' || kind.type === 'videoNote' || kind.type === 'sticker'}
            <MediaPreview kind={kind.type} attachment={kind.attachment} {media} own={message.own} onopen={() => actions.openMedia(message)} />
            {#if kind.attachment.caption}<span class="caption text"><LinkedText text={kind.attachment.caption} /></span>{/if}
          {:else if kind.type === 'voice'}
            <VoiceMessage attachment={kind.attachment} {media} />
            {#if kind.attachment.caption}<span class="caption text"><LinkedText text={kind.attachment.caption} /></span>{/if}
          {:else if kind.type === 'file' || kind.type === 'audio'}
            <FileCard kind={kind.type} attachment={kind.attachment} {media} />
            {#if kind.attachment.caption}<span class="caption text"><LinkedText text={kind.attachment.caption} /></span>{/if}
          {:else if kind.type === 'location'}
            <LocationCard place={kind.place} />
          {:else}
            <span class="label">{attachmentLabel(kind)}</span>
          {/if}
        </span>
      </div>
      <!-- Время, «изменено», закреп и доставка — рядом с пузырём, а не в его углу, как
           `MessageMarks` нативной Искры: в углу время дерётся с последней строкой за место. -->
      <span class="marks">
        {#if message.pinned}
          <svg class="pin" viewBox={ICON_VIEWBOX} role="img" aria-label={t('room.pinned')}><path d={icons.pin} /></svg>
        {/if}
        {#if message.edited}<span>{t('message.edited')}</span>{/if}
        <time>{clock(message.ts, i18n.locale)}</time>
        {#if message.delivery.state === 'sending'}
          <svg viewBox={ICON_VIEWBOX} role="img" aria-label={t('message.delivery.sending')}><path d={icons.sending} /></svg>
        {:else if message.own && message.readMark}
          <svg viewBox={ICON_VIEWBOX} role="img" aria-label={t('message.delivery.read')}><path d={icons.read} /></svg>
        {:else if message.own && !message.read && message.delivery.state === 'sent' && message.eventId}
          <svg viewBox={ICON_VIEWBOX} role="img" aria-label={t('message.delivery.sent')}><path d={icons.check} /></svg>
        {/if}
      </span>
        {#if interactive && viewport.finePointer}
          <!-- Панель по наведению. В порядке табуляции — только «ещё»: остальное есть в меню,
               а три остановки на каждом из сотен сообщений сделали бы Tab бесполезным. -->
          <div class="hover-bar" class:inside={barInside} bind:this={hoverBar}>
            <button type="button" tabindex="-1" aria-label={t('message.menu.react', { emoji: preferences.quickReaction })} title={t('message.menu.react', { emoji: preferences.quickReaction })} onclick={() => actions.react(message, preferences.quickReaction)}>{preferences.quickReaction}</button>
            {#if actions.canReply}
              <button type="button" tabindex="-1" aria-label={t('message.menu.reply')} title={t('message.menu.reply')} onclick={() => actions.reply(message)}>
                <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.reply} /></svg>
              </button>
            {/if}
            <button type="button" aria-label={t('message.menu.more')} title={t('message.menu.more')} aria-haspopup="menu" onclick={more}>
              <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.more} /></svg>
            </button>
          </div>
        {/if}
      </div>
      {#if message.thread && actions.openThread}
        {@const open = actions.openThread}
        <ThreadLine thread={message.thread} onopen={() => open(message)} />
      {/if}
      {#if message.reactions.length}
        <ul class="reactions" aria-label={t('message.reactions')}>
          {#each message.reactions as reaction (reaction.key)}
            <li>
              <!-- Число — когда есть что считать: одного человека и так говорит эмодзи. -->
              <button
                type="button"
                class:mine={reaction.mine}
                aria-pressed={reaction.mine}
                aria-label={plural('message.menu.reaction', reaction.count, { emoji: reaction.key })}
                disabled={!interactive}
                onclick={() => actions.react(message, reaction.key)}
                >{reaction.key}{#if reaction.count > 1}<span class="count">{reaction.count}</span>{/if}</button
              >
            </li>
          {/each}
        </ul>
      {/if}
      {#if failed}
        <div class="failure" role="alert">
          <strong>{t('message.delivery.failed')}</strong>
          <span>{t(`sendFailure.${failed.reason}`)}</span>
          <span class="actions">
            <button type="button" onclick={() => actions.discard(message.key)}>{t('message.delivery.discard')}</button>
            {#if failed.reason === 'identityChanged' || failed.reason === 'insecureDevices'}
              <button type="button" class="again" onclick={() => actions.sendAnyway(message.key)}>{t('message.delivery.sendAnyway')}</button>
            {:else}
              <button type="button" class="again" onclick={() => actions.retry(message.key)}>{t('message.delivery.sendAgain')}</button>
            {/if}
          </span>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .forwarded {
    display: block;
    margin-block-end: var(--space-close);
    font-size: var(--font-size-caption);
    font-style: italic;
    opacity: 0.8;
  }
  .service {
    margin: var(--space-close) auto;
    max-width: 80%;
    text-align: center;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-close);
    margin-block-start: var(--space-within-run);
  }
  .row.first {
    margin-block-start: var(--space-between-senders);
  }
  .row.own {
    justify-content: flex-end;
  }
  .face {
    flex: none;
    width: var(--size-message-avatar);
    --avatar-size: var(--size-message-avatar);
  }
  .stack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-tight);
    max-width: var(--bubble-width-fraction);
    min-width: 0;
  }
  .own .stack {
    align-items: flex-end;
  }
  .to-profile {
    display: block;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .sender {
    padding-inline: var(--bubble-pad-x);
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  /* На обоях надпись, стоящая прямо на фоне, — на плашке, как разделитель дня: серый текст
     на «Море» не прочитать. Внутри пузырей ничего не меняется. */
  :global([data-wallpaper]) .sender,
  :global([data-wallpaper]) .service {
    width: fit-content;
    padding: var(--space-within-run) var(--space-close);
    border-radius: var(--radius-circle);
    background: var(--color-incoming-bubble);
  }
  :global([data-wallpaper]) .sender {
    align-self: flex-start;
    margin-inline-start: calc(var(--bubble-pad-x) - var(--space-close));
  }
  .bubble {
    max-width: 100%;
    padding: var(--bubble-pad-y) var(--bubble-pad-x);
    border-radius: var(--radius-bubble);
    background: var(--color-incoming-bubble);
    overflow-wrap: anywhere;
  }
  /* Переносы строк из сообщения сохраняются — но только в самом тексте, а не в разметке
     вокруг него. */
  .text,
  em {
    white-space: pre-wrap;
  }
  .own .bubble {
    background: var(--bubble-own);
    color: var(--on-bubble-own);
  }
  .bubble.notice .content {
    opacity: 0.8;
  }
  .bubble.muted em {
    opacity: 0.7;
  }
  /* Надгробие — пунктирный контур вместо заливки, как `deletedBubble` нативной: тише слов внутри.
     Рамка внутри пузыря, поэтому отступ уменьшен на её толщину. */
  .bubble.deleted,
  .own .bubble.deleted {
    padding: calc(var(--bubble-pad-y) - var(--border-hairline)) calc(var(--bubble-pad-x) - var(--border-hairline));
    border: var(--border-hairline) dashed var(--color-text-secondary);
    background: transparent;
    color: var(--color-text-secondary);
  }
  .bubble.deleted em {
    opacity: 1;
  }
  /* В компактном столбце контура нет — слова серым, как у нативной в `.plain`. */
  .compact .bubble.deleted {
    border: none;
  }
  .quote {
    display: flex;
    flex-direction: column;
    margin-block-end: var(--space-tight);
    padding-inline-start: var(--space-close);
    border-inline-start: var(--border-hairline) solid currentColor;
    font-size: var(--font-size-caption);
    opacity: 0.8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .quote span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .label {
    display: block;
    font-size: var(--font-size-caption);
    font-weight: 600;
    opacity: 0.8;
  }
  /* Отметки — серой колонкой у пузыря, по его нижнему краю: у чужого — справа, у своего —
     слева. Никогда не сжимают пузырь. */
  .marks {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--space-tight);
    padding-block-end: var(--space-tight);
    font-size: var(--font-size-caption);
    line-height: 1.2;
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .marks svg {
    width: var(--font-size-caption);
    height: var(--font-size-caption);
    fill: currentColor;
  }
  :global([data-wallpaper]) .marks {
    padding: var(--space-within-run) var(--space-close);
    border-radius: var(--radius-circle);
    background: var(--color-incoming-bubble);
  }
  /* Компактный: без пузыря, во всю ширину, лицо — сверху серии. */
  .row.compact {
    align-items: flex-start;
  }
  /* У строки без пузыря нет края, и при зазоре в 2 px два сообщения читались бы как одно в две
     строки. */
  .row.compact:not(.first) {
    margin-block-start: var(--space-within-compact-run);
  }
  .compact .stack {
    flex: 1;
    max-width: 100%;
  }
  .compact .sender {
    padding-inline: 0;
  }
  :global([data-wallpaper]) .compact .sender {
    margin-inline-start: 0;
  }
  .compact .bubble-wrap {
    width: 100%;
  }
  /* Строка — во всю ширину, отметки — в конце неё. */
  .compact .bubble {
    flex: 1;
  }
  .compact .bubble:not(.visual) {
    padding: 0;
    border-radius: 0;
    background: transparent;
  }
  /* На обоях строка без пузыря потерялась бы на картинке — ей возвращается плашка. */
  :global([data-wallpaper]) .compact .bubble:not(.visual) {
    padding: var(--space-tight) var(--space-close);
    border-radius: var(--radius-control);
    background: var(--color-incoming-bubble);
  }
  .compact .bubble.visual {
    background: transparent;
  }
  .reactions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-tight);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .reactions button {
    min-height: var(--size-unread-badge);
    padding: var(--space-within-run) var(--space-close);
    border: var(--border-hairline) solid transparent;
    border-radius: var(--radius-circle);
    background: var(--color-incoming-bubble);
    color: inherit;
    font-size: var(--font-size-caption);
    cursor: pointer;
    transition:
      background var(--timing-reaction) var(--ease-out),
      border-color var(--timing-reaction) var(--ease-out),
      transform var(--timing-reaction) var(--ease-menu-open);
  }
  /* Нажатие — чуть вдавливается и отпружинивает: реакция ставится пальцем, и палец это видит. */
  .reactions button:active:not(:disabled) {
    transform: scale(var(--motion-scale-from));
  }
  /* Своя — тоном серого, а не рамкой: заметно, когда ищешь, и не кричит, когда нет. Число своей — акцентом. */
  .reactions button.mine {
    background: var(--color-own-reaction);
  }
  .count {
    margin-inline-start: var(--space-tight);
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }
  .mine .count {
    color: var(--accent);
  }
  .reactions button:disabled {
    cursor: default;
  }
  /* Палец: без выделения текста и системного меню по долгому нажатию — там наше меню,
     и «Скопировать» в нём есть. Горизонтальный жест — наш, вертикальный — прокрутке. */
  @media (pointer: coarse) {
    .interactive .bubble {
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      touch-action: pan-y;
    }
  }
  .bubble {
    transition: transform var(--timing-chrome) ease-out;
  }
  /* По ширине картинки: подпись переносится под неё, а не растягивает пузырь. */
  .bubble.visual {
    width: min-content;
    padding: var(--space-tight);
  }
  .bubble.visual .caption {
    display: block;
    padding: var(--space-tight) var(--space-close) 0;
  }
  /* Подпись альбома — с воздухом над и под ней: под мозаикой из нескольких фото прижатая
     строка терялась. Сверху чуть меньше, чем снизу вместе с краем пузыря: подпись — к фото. */
  .bubble.visual .album-caption {
    padding: var(--space-close) var(--space-close) var(--space-close);
  }
  /* Стикер и «кружочек» — без пузыря: у них своя форма. */
  .bubble.bare,
  .own .bubble.bare {
    padding: 0;
    background: transparent;
    color: var(--color-text);
  }
  .bubble-wrap {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: var(--space-close);
    max-width: 100%;
    min-width: 0;
  }
  .own .bubble-wrap {
    flex-direction: row-reverse;
  }
  .bubble-wrap > .bubble {
    min-width: 0;
  }
  /* Сбоку от пузыря, по его середине, — в пустоте ленты: не закрывает ни имя, ни текст,
     ни время. Зазор — полем, а не в `inset`: его меряет `placeHoverBar`. */
  .hover-bar {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 100%;
    margin-inline-start: var(--space-tight);
    translate: 0 -50%;
    /* Не `display: none`: спрятанное так не получает фокус, и «ещё» стало бы недоступно
       с клавиатуры. Прозрачная и не ловит мышь — пока над строкой не навели или не
       пришли табуляцией. */
    display: flex;
    opacity: 0;
    pointer-events: none;
    gap: var(--space-within-run);
    padding: var(--space-within-run);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-circle);
    background: var(--color-glass-opaque);
    box-shadow: 0 var(--space-within-run) var(--space-close) rgb(0 0 0 / 0.12);
    z-index: 1;
    transition: opacity var(--timing-chrome) var(--ease-out);
  }
  .own .hover-bar {
    inset-inline-start: auto;
    inset-inline-end: 100%;
    margin-inline: 0 var(--space-tight);
  }
  /* Сбоку не помещается — на верхнем крае пузыря, у дальнего угла: как у Slack и Telegram
     Desktop, закрывает край пузыря, но не уходит за экран. */
  .hover-bar.inside,
  .own .hover-bar.inside {
    inset-block-start: 0;
    inset-inline: auto var(--space-close);
    margin: 0;
  }
  .own .hover-bar.inside {
    inset-inline: var(--space-close) auto;
  }
  /* Текущее сообщение с клавиатуры — обводкой акцента, как пункт меню. */
  .bubble:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .row:hover .hover-bar,
  .row:focus-within .hover-bar {
    opacity: 1;
    pointer-events: auto;
  }
  .hover-bar button {
    display: grid;
    place-items: center;
    width: var(--tap-target);
    height: var(--tap-target);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
  }
  .hover-bar button:hover {
    background: var(--color-selected);
  }
  .hover-bar svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
  /* HTML сообщения: разметка Matrix, но в масштабе пузыря. */
  .html :global(p),
  .html :global(ul),
  .html :global(ol),
  .html :global(blockquote),
  .html :global(pre) {
    margin: 0 0 var(--space-tight);
  }
  .html :global(ul),
  .html :global(ol) {
    padding-inline-start: var(--space-generous);
  }
  .html :global(blockquote) {
    padding-inline-start: var(--space-close);
    border-inline-start: var(--border-hairline) solid currentColor;
    opacity: 0.85;
  }
  .html :global(code),
  .html :global(pre) {
    font-family: var(--font-code);
    font-size: var(--font-size-caption);
  }
  .html :global(pre) {
    padding: var(--space-close);
    border-radius: var(--radius-control);
    background: var(--color-incoming-bubble);
    overflow-x: auto;
    white-space: pre;
  }
  .html :global(a) {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
  .html :global(.mention) {
    font-weight: 600;
  }
  .html :global(.spoiler) {
    background: currentColor;
    border-radius: var(--radius-control);
    transition: background var(--timing-chrome);
  }
  .html :global(.spoiler:hover),
  .html :global(.spoiler:focus) {
    background: transparent;
  }
  .failure {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-tight);
    max-width: 100%;
    font-size: var(--font-size-caption);
    color: var(--color-danger);
    text-align: end;
  }
  .failure span:not(.actions) {
    color: var(--color-text-secondary);
  }
  .actions {
    display: flex;
    gap: var(--space-close);
  }
  .actions button {
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    border: none;
    border-radius: var(--radius-circle);
    background: var(--color-incoming-bubble);
    cursor: pointer;
  }
  .actions .again {
    background: var(--accent);
    color: var(--on-accent);
  }
</style>
