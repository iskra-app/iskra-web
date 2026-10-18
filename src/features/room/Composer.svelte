<!--
  Композер.

  Что делает `Enter`, решает указатель, а не ширина: с мышью и клавиатурой `Enter`
  отправляет, `Shift+Enter` — новая строка; на сенсорном — наоборот: `Enter` переносит
  строку, отправляет кнопка. Ноутбук с сенсорным экраном широкий, но у него есть мышь.

  Над полем — полоса ответа или правки. `Esc` её убирает, `↑` в пустом поле берёт в правку
  последнее своё сообщение. Текст и полосу держит `RoomView` (черновик, «печатает»);
  композер только показывает и сообщает.

  Пустое поле — на месте «Отправить» микрофон (`recordGesture.ts`); пока идёт запись, на месте
  поля — полоса записи. Кнопка та же самая, пока палец её держит: убрать её из-под пальца —
  значит потерять отпускание. Браузер не пишет AAC — микрофона нет (см. `media/voice.ts`).

  «Стекло» — навигационный слой: полупрозрачность и размытие, где браузер их тянет.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Menu from '../../design/Menu.svelte';
  import { viewport } from '../../design/viewport.svelte.ts';
  import { t } from '../../i18n/index.svelte.ts';
  import type { OutgoingFile } from '../../core/media/upload';
  import AttachmentTray from '../media/AttachmentTray.svelte';
  import { insertMention, mentionMatches, mentionQuery, type ComposerMention } from '../../core/timeline/composerMentions';
  import MentionPicker, { type MentionRow } from './MentionPicker.svelte';
  import { firstLineOf } from '../../core/timeline/words';
  import type { ComposerContext } from './actions';
  import { attachmentLabel } from './text';
  import { VoiceRecorder, type Recording } from '../media/voiceRecorder.svelte.ts';
  import RecordingStrip from './RecordingStrip.svelte';
  import { moveOf, releaseOf } from './recordGesture';

  interface Props {
    text: string;
    context: ComposerContext;
    onsend: (text: string) => void;
    /** Человек что-то набрал или стёр — не программная подстановка черновика. */
    oninput?: (text: string) => void;
    oncancelcontext: () => void;
    /** `↑` в пустом поле. `true` — нашлось, что править. */
    oneditlast: () => boolean;
    /** Вложения к отправке — их держит `RoomView`. */
    attachments?: OutgoingFile[];
    /** Выбрали, вставили или перетащили файлы. */
    onfiles?: (files: File[]) => void;
    onremoveattachment?: (index: number) => void;
    /** «Геопозиция» в меню скрепки. */
    onlocation?: () => void;
    /** «Опрос» в меню скрепки. Нет — пункта нет: в личном чате опрос ни к чему. */
    onpoll?: () => void;
    /**
     * Выбранные из списка «@» — рядом с черновиком: в поле простые слова, а это говорит, какой
     * `@Кай` какой. Держит `RoomView`, как и сам черновик.
     */
    mentions?: ComposerMention[];
    /** Кого можно позвать. Нет — списка нет: личный чат, звать там некого. */
    mentionCandidates?: () => MentionRow[];
    mentionPhoto?: (member: MentionRow) => string | undefined;
    /** Записали голосовое. Нет — микрофона нет. */
    onvoice?: (recording: Recording) => void;
    /** Микрофон не дали или он не включился. */
    onvoiceproblem?: (problem: 'denied' | 'unavailable') => void;
    disabled?: boolean;
  }
  let {
    text = $bindable(''),
    context,
    onsend,
    oninput,
    oncancelcontext,
    oneditlast,
    attachments = [],
    onfiles,
    onremoveattachment,
    onlocation,
    onpoll,
    mentions = $bindable([]),
    mentionCandidates,
    mentionPhoto = () => undefined,
    onvoice,
    onvoiceproblem,
    disabled = false,
  }: Props = $props();

  // ————— «@» —————

  /** Где курсор — по нему ищется «@…», который сейчас набирают. */
  let cursor = $state<number | null>(null);
  /** Список закрыли `Esc` — до следующего набранного символа. */
  let dismissed = $state(false);
  let active = $state(0);
  /** Люди комнаты — спрошены при первом «@» и запомнены. */
  let candidates = $state.raw<MentionRow[] | null>(null);
  const pickerId = $props.id();

  const query = $derived(mentionCandidates && cursor !== null && !dismissed ? mentionQuery(text, cursor) : null);
  $effect(() => {
    if (query && !candidates && mentionCandidates) candidates = mentionCandidates();
  });
  const matches = $derived(query && candidates ? mentionMatches(query.text, candidates) : []);
  $effect(() => {
    void query?.text;
    active = 0;
  });

  function trackCursor() {
    cursor = field && field.selectionStart === field.selectionEnd ? field.selectionStart : null;
  }

  /** Выбрали имя: в черновик вместо набранного, курсор — за ним. */
  function pick(member: MentionRow) {
    if (!query) return;
    const inserted = insertMention(member, query, text);
    text = inserted.text;
    mentions = [...mentions, inserted.mention];
    oninput?.(text);
    const target = field;
    if (!target) return;
    target.focus();
    // Сразу, как Svelte положил новый текст в поле: кадром позже следующая буква успела бы
    // встать в конец, а курсор потом прыгнул бы ей за спину.
    void tick().then(() => {
      target.setSelectionRange(inserted.cursor, inserted.cursor);
      trackCursor();
    });
  }

  /** Клавиши списка. `true` — клавиша его. */
  function mentionKey(event: KeyboardEvent): boolean {
    if (!matches.length) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + matches.length) % matches.length;
      return true;
    }
    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
      pick(matches[active]!);
      return true;
    }
    if (event.key === 'Escape') {
      dismissed = true;
      return true;
    }
    return false;
  }

  // ————— Голосовое —————

  const recorder = new VoiceRecorder();
  const canRecord = VoiceRecorder.supported();
  /** Нажатие на микрофон, пока палец (или мышь) его держит. */
  let press = $state<{ x: number; y: number; at: number; id: number } | null>(null);
  /** Клик следом за отпусканием — уже обработан жестом. */
  let swallowClick = false;
  let voiceButton: HTMLButtonElement | undefined = $state();

  const recording = $derived(recorder.active);

  async function startRecording() {
    await recorder.start();
    if (recorder.state === 'denied' || recorder.state === 'unavailable') {
      onvoiceproblem?.(recorder.state);
      recorder.dismiss();
      press = null;
    }
  }

  async function sendVoice() {
    const done = await recorder.finish();
    if (done) onvoice?.(done);
    voiceButton?.focus();
  }

  /** Выбросить запись — «Отмена», свайп в сторону, `Esc`, уход из чата. */
  export function cancelRecording() {
    press = null;
    recorder.cancel();
  }

  $effect(() => () => recorder.cancel());

  function voiceDown(event: PointerEvent) {
    swallowClick = false;
    if (recording || event.button !== 0 || !event.isPrimary) return;
    // Иначе нажатие уведёт фокус и начнёт выделение текста под пальцем.
    event.preventDefault();
    voiceButton?.setPointerCapture(event.pointerId);
    press = { x: event.clientX, y: event.clientY, at: performance.now(), id: event.pointerId };
    void startRecording();
  }

  function voiceMove(event: PointerEvent) {
    if (!press || event.pointerId !== press.id) return;
    const move = moveOf(event.clientX - press.x, event.clientY - press.y);
    if (move === 'hold') return;
    swallowClick = true;
    if (move === 'cancel') cancelRecording();
    else press = null; // без рук
  }

  function voiceUp(event: PointerEvent) {
    if (!press || event.pointerId !== press.id) return;
    const release = releaseOf(performance.now() - press.at);
    press = null;
    swallowClick = true;
    if (release === 'send') void sendVoice();
  }

  /** Браузер забрал касание себе (прокрутка, системный жест) — записи никто не держит. */
  function voiceLost(event: PointerEvent) {
    if (press && event.pointerId === press.id) cancelRecording();
  }

  function voiceClick(event: MouseEvent) {
    // С клавиатуры (`detail === 0`) — всегда клик: Enter начинает без рук, Enter отправляет.
    if (swallowClick && event.detail !== 0) {
      swallowClick = false;
      return;
    }
    if (recording) void sendVoice();
    else void startRecording();
  }

  async function stopRecording() {
    await recorder.stop();
    voiceButton?.focus();
  }

  function recordingKey(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !recording) return;
    event.preventDefault();
    event.stopPropagation();
    cancelRecording();
    void tick().then(() => voiceButton?.focus());
  }

  /** Меню скрепки — как «+» нативной Искры: фото, файл, место. */
  let attachMenu = $state<{ x: number; y: number } | null>(null);

  function openAttachMenu(event: MouseEvent) {
    if (!canAttach) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    attachMenu = { x: rect.left, y: rect.top };
  }

  /** Пункт меню: закрыть — и выбрать. Фото — с фильтром, файл — любой. */
  function choose(accept: string) {
    attachMenu = null;
    if (picker) picker.accept = accept;
    picker?.click();
  }

  let field: HTMLTextAreaElement | undefined = $state();
  let picker: HTMLInputElement | undefined = $state();
  // С вложением можно отправить и без текста: текст тогда — подпись, а её может не быть.
  const empty = $derived(text.trim() === '' && attachments.length === 0);
  /** При правке вложений не бывает: меняется только текст. */
  const canAttach = $derived(!!onfiles && context?.kind !== 'edit' && !disabled);
  /** Микрофон на месте «Отправить»: поле пустое, вложений нет, это не правка. */
  const voiceMode = $derived(!!onvoice && canRecord && (recording || (empty && context?.kind !== 'edit' && !disabled)));

  /** Одна строка о том, на что отвечаем или что правим. */
  const quote = $derived.by(() => {
    const kind = context?.message.kind;
    if (!kind) return '';
    if ('body' in kind) return firstLineOf(kind.body, 'html' in kind ? kind.html : undefined);
    if (kind.type === 'poll') return kind.poll.question;
    return attachmentLabel(kind);
  });

  // Взяли в правку или начали отвечать — поле в фокусе, курсор в конце. Кадром позже:
  // закрывающееся меню (`<dialog>`) возвращает фокус туда, откуда его открыли, и сделало
  // бы это после нас.
  $effect(() => {
    if (!context || !field) return;
    const target = field;
    const frame = requestAnimationFrame(() => {
      target.focus();
      const end = target.value.length;
      target.setSelectionRange(end, end);
    });
    return () => cancelAnimationFrame(frame);
  });

  /** Поле растёт с текстом — до потолка, дальше прокручивается само. */
  function grow() {
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }
  $effect(() => {
    void text;
    grow();
  });

  function send() {
    if (empty || disabled) return;
    onsend(text);
    field?.focus();
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (mentionKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === 'Escape' && context) {
      // Своё `Esc` — убрать полосу; до «закрыть верхнее» уровня приложения не доходит.
      event.preventDefault();
      event.stopPropagation();
      oncancelcontext();
      return;
    }
    if (event.key === 'ArrowUp' && text === '' && !context && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      if (oneditlast()) event.preventDefault();
      return;
    }
    // Набор через IME (японский, китайский…) — Enter подтверждает слово, а не отправляет.
    if (event.key !== 'Enter') return;
    const sends = viewport.finePointer ? !event.shiftKey : false;
    if (!sends) return;
    event.preventDefault();
    send();
  }

  /** `Ctrl/⌘ Shift U` — сразу выбор файла, мимо меню: сочетание клавиш не переспрашивает. */
  export function attach() {
    if (!canAttach) return;
    if (picker) picker.accept = '';
    picker?.click();
  }

  /** Вставка из буфера: файлы — во вложения, текст — как обычно. */
  function onpaste(event: ClipboardEvent) {
    const files = [...(event.clipboardData?.files ?? [])];
    if (!files.length || !canAttach) return;
    event.preventDefault();
    onfiles?.(files);
  }

  function picked() {
    const files = [...(picker?.files ?? [])];
    if (files.length) onfiles?.(files);
    if (picker) picker.value = '';
  }

  /** Чтобы открытый чат сразу принимал текст — на десктопе. На телефоне клавиатура не выскакивает сама. */
  export function focus() {
    if (viewport.finePointer) field?.focus();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="composer glass" onkeydown={recordingKey}>
{#if context}
  <div class="context">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {#if context.kind === 'reply'}<path d="M10 7L4 12l6 5M4 12h11a5 5 0 0 1 5 5v1" />{:else}<path d="M4 20h4L19 9l-4-4L4 16v4z" />{/if}
    </svg>
    <span class="what">
      <span class="title">
        <strong>{context.kind === 'reply' ? t('room.replyingTo') : t('room.editingMessage')}</strong>
        {#if context.kind === 'reply'}<span class="who">{context.message.senderName}</span>{/if}
      </span>
      <span class="quote">{quote}</span>
    </span>
    <button type="button" class="cancel" aria-label={t('room.stopReplying')} title={t('room.stopReplying')} onclick={oncancelcontext}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>
{/if}
{#if attachments.length && onremoveattachment}
  <AttachmentTray files={attachments} onremove={onremoveattachment} />
{/if}
{#if matches.length}
  <MentionPicker id={pickerId} members={matches} {active} photoOf={mentionPhoto} onpick={pick} />
{/if}
<form
  class="row"
  onsubmit={(event) => {
    event.preventDefault();
    send();
  }}
>
  {#if recording}
    <RecordingStrip {recorder} oncancel={() => {
      cancelRecording();
      void tick().then(() => voiceButton?.focus());
    }} />
  {:else}
  {#if onfiles}
    <button type="button" class="attach" disabled={!canAttach} aria-label={t('room.attach')} title={t('room.attach')} aria-haspopup="menu" onclick={openAttachMenu}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7" /></svg>
    </button>
    <input bind:this={picker} type="file" multiple hidden onchange={picked} />
  {/if}
  <textarea
    bind:this={field}
    bind:value={text}
    rows="1"
    placeholder={t('room.composerPlaceholder')}
    aria-label={t('room.composerPlaceholder')}
    enterkeyhint={viewport.finePointer ? 'send' : 'enter'}
    {disabled}
    {onkeydown}
    {onpaste}
    aria-autocomplete={mentionCandidates ? 'list' : undefined}
    aria-controls={matches.length ? pickerId : undefined}
    aria-activedescendant={matches.length ? `${pickerId}-${active}` : undefined}
    oninput={() => {
      dismissed = false;
      trackCursor();
      oninput?.(text);
    }}
    onkeyup={trackCursor}
    onclick={trackCursor}
    onselect={trackCursor}
    onblur={() => (cursor = null)}
  ></textarea>
  {/if}
  {#if recorder.state === 'recording' && !press}
    <button type="button" class="stop" aria-label={t('voice.stop')} title={t('voice.stop')} onclick={stopRecording}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
    </button>
  {/if}
  {#if voiceMode}
    <span class="voice-slot">
      {#if press && recording}
        <span class="lock" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M8 11V8a4 4 0 0 1 8 0v3M6 11h12v9H6z" /></svg>
          <svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" /></svg>
        </span>
      {/if}
      <button
        bind:this={voiceButton}
        type="button"
        class="send voice"
        class:held={!!press}
        aria-label={recording ? t('recording.send') : t('voice.record')}
        title={recording ? t('recording.send') : t('voice.record')}
        onpointerdown={voiceDown}
        onpointermove={voiceMove}
        onpointerup={voiceUp}
        onpointercancel={voiceLost}
        onclick={voiceClick}
        oncontextmenu={(event) => event.preventDefault()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {#if recording && !press}<path d="M12 19V5M5 12l7-7 7 7" />{:else}<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />{/if}
        </svg>
      </button>
    </span>
  {:else}
    <button type="submit" class="send" disabled={empty || disabled} aria-label={t('room.send')} title={t('room.send')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
    </button>
  {/if}
</form>

<Menu open={!!attachMenu} x={attachMenu?.x ?? 0} y={attachMenu?.y ?? 0} sheet={!viewport.finePointer} label={t('room.attach')} onclose={() => (attachMenu = null)}>
  <button type="button" role="menuitem" onclick={() => choose('image/*,video/*')}>{t('room.attachPhoto')}</button>
  <button type="button" role="menuitem" onclick={() => choose('')}>{t('room.attachFile')}</button>
  {#if onpoll}
    <button
      type="button"
      role="menuitem"
      onclick={() => {
        attachMenu = null;
        onpoll?.();
      }}>{t('poll.attach')}</button
    >
  {/if}
  {#if onlocation}
    <button
      type="button"
      role="menuitem"
      onclick={() => {
        attachMenu = null;
        onlocation?.();
      }}>{t('location.attach')}</button
    >
  {/if}
</Menu>
</div>

<style>
  .composer {
    width: 100%;
    padding: var(--space-close) var(--timeline-gutter);
    padding-block-end: max(var(--space-close), env(safe-area-inset-bottom));
  }
  .row,
  .context {
    display: flex;
    align-items: flex-end;
    gap: var(--space-close);
    max-width: var(--column-timeline-max);
    margin-inline: auto;
  }
  .context {
    align-items: center;
    margin-block-end: var(--space-close);
    padding-inline-start: var(--space-close);
    color: var(--accent);
    transition:
      opacity var(--timing-chrome) var(--ease-out),
      transform var(--timing-chrome) var(--ease-out);
  }
  /* Полоса ответа и правки — выезжает из-под поля, к которому относится. */
  @starting-style {
    .context {
      opacity: 0;
      transform: translateY(var(--motion-rise));
    }
  }
  .context > svg,
  .cancel svg {
    flex: none;
    width: var(--size-icon);
    height: var(--size-icon);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .what {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    padding-inline-start: var(--space-close);
    border-inline-start: 2px solid currentColor;
    font-size: var(--font-size-caption);
  }
  .title {
    display: flex;
    gap: var(--space-tight);
  }
  .who {
    font-weight: 600;
    color: var(--color-text);
  }
  .quote {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-secondary);
  }
  .cancel {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--tap-target);
    height: var(--tap-target);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .glass {
    background: var(--color-glass-opaque);
  }
  @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
    .glass {
      background: var(--color-glass);
      -webkit-backdrop-filter: saturate(180%) blur(var(--backdrop-blur));
      backdrop-filter: saturate(180%) blur(var(--backdrop-blur));
    }
  }
  textarea {
    flex: 1;
    min-height: var(--size-navigation-bar);
    max-height: 40vh;
    padding: calc((var(--size-navigation-bar) - 1lh) / 2) var(--space-roomy);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-bubble);
    background: var(--color-background);
    resize: none;
    line-height: var(--line-height-body);
    overflow-y: auto;
  }
  textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 0;
    border-color: transparent;
  }
  .attach {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--size-navigation-bar);
    height: var(--size-navigation-bar);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .attach:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .attach svg {
    width: var(--size-icon-button);
    height: var(--size-icon-button);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .send {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--size-navigation-bar);
    height: var(--size-navigation-bar);
    border: none;
    border-radius: var(--radius-circle);
    background: var(--accent);
    color: var(--on-accent);
    cursor: pointer;
  }
  .voice-slot {
    position: relative;
    flex: none;
  }
  /* Палец не должен прокручивать ленту, выделять текст или звать меню, пока держит запись. */
  .voice {
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    transition: transform var(--timing-chrome) var(--ease-out);
  }
  .voice.held {
    transform: scale(var(--motion-held-scale));
  }
  /* Замок над пальцем: вверх — без рук. Подсказка там, где палец, а не в конце полосы. */
  .lock {
    position: absolute;
    inset-inline: 0;
    bottom: calc(100% + var(--space-normal));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-tight);
    padding-block: var(--space-close);
    border-radius: var(--radius-circle);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    box-shadow: 0 0 0 var(--border-hairline) var(--color-separator);
    transition:
      opacity var(--timing-chrome) var(--ease-out),
      transform var(--timing-chrome) var(--ease-out);
  }
  @starting-style {
    .lock {
      opacity: 0;
      transform: translateY(var(--motion-rise));
    }
  }
  .lock svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .stop {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--size-navigation-bar);
    height: var(--size-navigation-bar);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: var(--color-danger);
    cursor: pointer;
  }
  .stop svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
  .send:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .send svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
