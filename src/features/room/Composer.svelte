<!--
  Композер.

  Что делает `Enter`, решает указатель, а не ширина: с мышью и клавиатурой `Enter`
  отправляет, `Shift+Enter` — новая строка (или, по настройке «Чаты», `Enter` переносит, а
  отправляет `Ctrl/⌘ Enter`); на сенсорном — `Enter` переносит строку, отправляет кнопка.
  Ноутбук с сенсорным экраном широкий, но у него есть мышь.

  Над полем — полоса ответа или правки. `Esc` её убирает, `↑` в пустом поле берёт в правку
  последнее своё сообщение. Текст и полосу держит `RoomView` (черновик, «печатает»);
  композер только показывает и сообщает.

  Пустое поле — на месте «Отправить» микрофон (`recordGesture.ts`); пока идёт запись, на месте
  поля — полоса записи. Кнопка та же самая, пока палец её держит: убрать её из-под пальца —
  значит потерять отпускание. Браузер не пишет AAC — микрофона нет (см. `media/voice.ts`).

  «Стекло» — навигационный слой: полупрозрачность и размытие, где браузер их тянет.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import { tick } from 'svelte';
  import Menu from '../../design/Menu.svelte';
  import { viewport } from '../../design/viewport.svelte.ts';
  import { isMac } from '../../design/hotkeys';
  import { preferences } from '../app/preferences.svelte.ts';
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
  import { HOLD_MS, moveOf, releaseOf } from './recordGesture';
  import { VideoNoteRecorder } from '../media/videoNoteRecorder.svelte.ts';

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
    /** Кнопка стикеров в поле — где её нажали. Нет — кнопки нет (все наборы выключены). */
    onstickers?: (at: { x: number; y: number }) => void;
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
    /** Рекордер «кружочков» — его держит `RoomView`, там же слой камеры. Нет — камеры нет. */
    videoNote?: VideoNoteRecorder;
    /** Палец держит кнопку, пока снимается «кружочек»: над спуском — замок. */
    videoHolding?: boolean;
    /** «Кружочек» пора отправить: отпустили, нажали «Отправить» или кончилась минута. */
    onfinishvideonote?: () => void;
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
    onstickers,
    mentions = $bindable([]),
    mentionCandidates,
    mentionPhoto = () => undefined,
    onvoice,
    onvoiceproblem,
    videoNote,
    // Композер только пишет: читает `RoomView` — для замка над спуском.
    // eslint-disable-next-line no-useless-assignment
    videoHolding = $bindable(false),
    onfinishvideonote,
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

  // ————— Голосовое и «кружочек» —————

  type RecordKind = 'voice' | 'video';

  const recorder = new VoiceRecorder();
  const canVoice = VoiceRecorder.supported();
  const videoSupported = VideoNoteRecorder.supported();
  const canVideo = $derived(!!videoNote && videoSupported);
  /**
   * Что записывает кнопка — нажатие переключает, как в нативной Искре, и выбор помнится, пока
   * открыт композер: кто шлёт «кружочки», шлёт их несколько. Кнопка одна и на телефоне, и на
   * десктопе: щелчок мышью — переключить, удержание — записать. С клавиатуры Enter начинает
   * запись без рук: удерживать клавишу — не жест.
   */
  let mode = $state<RecordKind>(canVoice ? 'voice' : 'video');
  $effect(() => {
    if (!canVoice && !canVideo) return;
    if (mode === 'video' && !canVideo) mode = 'voice';
  });
  const kinds = $derived<RecordKind[]>([mode]);

  /** Нажатие на кнопку записи, пока палец (или мышь) её держит. `started` — запись пошла. */
  let press = $state<{ x: number; y: number; at: number; id: number; kind: RecordKind; started: boolean } | null>(null);
  let arming: ReturnType<typeof setTimeout> | undefined;
  /** Клик следом за отпусканием — уже обработан жестом. */
  let swallowClick = false;
  /** Кнопки записи по виду — фокус после записи возвращается на свою. */
  const buttons = $state<Partial<Record<RecordKind, HTMLButtonElement>>>({});

  const recording = $derived(recorder.active);
  const filming = $derived(!!videoNote?.open);

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
    buttons.voice?.focus();
  }

  /** Выбросить запись — «Отмена», свайп в сторону, `Esc`, уход из чата. */
  export function cancelRecording() {
    clearTimeout(arming);
    press = null;
    videoHolding = false;
    recorder.cancel();
    videoNote?.cancel();
  }

  $effect(() => () => {
    clearTimeout(arming);
    recorder.cancel();
  });

  /** Пошла запись. Камера поднимается слоем поверх комнаты (`VideoNoteCapture`). */
  function begin(kind: RecordKind, held: boolean) {
    if (kind === 'voice') {
      void startRecording();
      return;
    }
    videoHolding = held;
    // Клавиатура уходит: камера закрывает комнату, а набирать во время съёмки нечего.
    field?.blur();
    void videoNote?.start(() => onfinishvideonote?.());
  }

  function finish(kind: RecordKind) {
    if (kind === 'voice') void sendVoice();
    else {
      videoHolding = false;
      onfinishvideonote?.();
    }
  }

  function recordDown(event: PointerEvent, kind: RecordKind) {
    swallowClick = false;
    if (recording || filming || event.button !== 0 || !event.isPrimary) return;
    // Иначе нажатие уведёт фокус и начнёт выделение текста под пальцем.
    event.preventDefault();
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Указатель уже ушёл — захватывать нечего.
    }
    // Время самого ввода, а не обработчика: занятый кадр не должен делать нажатие удержанием.
    const current = { x: event.clientX, y: event.clientY, at: event.timeStamp, id: event.pointerId, kind, started: false };
    press = current;
    // Запись — после удержания, пальцем и мышью одинаково: короткое нажатие переключает голосовое и видео.
    clearTimeout(arming);
    arming = setTimeout(() => {
      if (!press || press.id !== current.id) return;
      press = { ...press, started: true };
      begin(kind, true);
    }, HOLD_MS);
  }

  function recordMove(event: PointerEvent) {
    if (!press || event.pointerId !== press.id) return;
    const move = moveOf(event.clientX - press.x, event.clientY - press.y);
    if (move === 'hold') return;
    swallowClick = true;
    if (!press.started) {
      // Увёл, не дождавшись записи, — это не нажатие и не запись.
      clearTimeout(arming);
      press = null;
    } else if (move === 'cancel') cancelRecording();
    else {
      // Без рук.
      press = null;
      videoHolding = false;
    }
  }

  function recordUp(event: PointerEvent) {
    if (!press || event.pointerId !== press.id) return;
    clearTimeout(arming);
    const { started, kind, at } = press;
    press = null;
    swallowClick = true;
    if (!started) {
      if (canVoice && canVideo) mode = mode === 'voice' ? 'video' : 'voice';
      return;
    }
    if (releaseOf(event.timeStamp - at) === 'send') finish(kind);
    else videoHolding = false;
  }

  /** Браузер забрал касание себе (прокрутка, системный жест) — записи никто не держит. */
  function recordLost(event: PointerEvent) {
    if (!press || event.pointerId !== press.id) return;
    if (press.started) cancelRecording();
    else {
      clearTimeout(arming);
      press = null;
    }
  }

  function recordClick(event: MouseEvent, kind: RecordKind) {
    // С клавиатуры (`detail === 0`) — всегда клик: Enter начинает без рук, Enter отправляет.
    if (swallowClick && event.detail !== 0) {
      swallowClick = false;
      return;
    }
    if (recording) void sendVoice();
    else if (!filming) begin(kind, false);
  }

  async function stopRecording() {
    await recorder.stop();
    buttons.voice?.focus();
  }

  function recordingKey(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !recording) return;
    event.preventDefault();
    event.stopPropagation();
    cancelRecording();
    void tick().then(() => buttons.voice?.focus());
  }

  function recordLabel(kind: RecordKind): string {
    if (recording) return t('recording.send');
    return kind === 'voice' ? t('voice.record') : t('videoNote.record');
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
  const voiceMode = $derived((canVoice || canVideo) && (recording || filming || (empty && context?.kind !== 'edit' && !disabled)));

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

  /** Кнопка стикеров — не при правке: правка меняет слова уже отправленного, а стикер — не слова. */
  const offersStickers = $derived(!!onstickers && context?.kind !== 'edit');

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
    const withMod = isMac() ? event.metaKey : event.ctrlKey;
    const sends = viewport.finePointer && (preferences.sendWithModEnter ? withMod : !event.shiftKey);
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
    <svg viewBox={ICON_VIEWBOX} aria-hidden="true">
      {#if context.kind === 'reply'}<path d={icons.reply} />{:else}<path d={icons.edit} />{/if}
    </svg>
    <span class="what">
      <span class="title">
        <strong>{context.kind === 'reply' ? t('room.replyingTo') : t('room.editingMessage')}</strong>
        {#if context.kind === 'reply'}<span class="who">{context.message.senderName}</span>{/if}
      </span>
      <span class="quote">{quote}</span>
    </span>
    <button type="button" class="cancel" aria-label={t('room.stopReplying')} title={t('room.stopReplying')} onclick={oncancelcontext}>
      <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.close} /></svg>
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
      void tick().then(() => buttons.voice?.focus());
    }} />
  {:else}
  {#if onfiles}
    <button type="button" class="attach" disabled={!canAttach} aria-label={t('room.attach')} title={t('room.attach')} aria-haspopup="menu" onclick={openAttachMenu}>
      <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.attach} /></svg>
    </button>
    <input bind:this={picker} type="file" multiple hidden onchange={picked} />
  {/if}
  <span class="field">
  <textarea
    bind:this={field}
    class:with-stickers={offersStickers}
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
  {#if offersStickers}
    <!-- В поле, у его конца, как в нативной: часть поля, а не кнопка рядом с ним. -->
    <button
      type="button"
      class="stickers"
      aria-label={t('stickers.open')}
      title={t('stickers.open')}
      aria-haspopup="menu"
      {disabled}
      onclick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onstickers?.({ x: rect.left, y: rect.top });
      }}
    >
      <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.emojiSmileys} /></svg>
    </button>
  {/if}
  </span>
  {/if}
  {#if recorder.state === 'recording' && !press}
    <button type="button" class="stop" aria-label={t('voice.stop')} title={t('voice.stop')} onclick={stopRecording}>
      <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.stop} /></svg>
    </button>
  {/if}
  {#if voiceMode}
    {#each recording ? (['voice'] as RecordKind[]) : kinds as kind (kind)}
      <span class="voice-slot">
        {#if press?.started && press.kind === 'voice' && recording}
          <span class="lock" aria-hidden="true">
            <svg viewBox={ICON_VIEWBOX}><path d={icons.lock} /></svg>
            <svg viewBox={ICON_VIEWBOX}><path d={icons.up} /></svg>
          </span>
        {/if}
        <button
          bind:this={buttons[kind]}
          type="button"
          class="send voice"
          class:held={press?.kind === kind && press.started}
          aria-label={recordLabel(kind)}
          title={recording ? recordLabel(kind) : t('recording.hint')}
          onpointerdown={(event) => recordDown(event, kind)}
          onpointermove={recordMove}
          onpointerup={recordUp}
          onpointercancel={recordLost}
          onclick={(event) => recordClick(event, kind)}
          oncontextmenu={(event) => event.preventDefault()}
        >
          <svg viewBox={ICON_VIEWBOX} aria-hidden="true">
            {#if recording && !press}<path d={icons.send} />{:else if kind === 'video'}<path d={icons.video} />{:else}<path d={icons.mic} />{/if}
          </svg>
        </button>
      </span>
    {/each}
  {:else}
    <button type="submit" class="send" disabled={empty || disabled} aria-label={t('room.send')} title={t('room.send')}>
      <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.send} /></svg>
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
    fill: currentColor;
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
  .field {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
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
  textarea.with-stickers {
    padding-inline-end: var(--size-navigation-bar);
  }
  .stickers {
    position: absolute;
    inset-block-end: 0;
    inset-inline-end: 0;
    display: grid;
    place-items: center;
    width: var(--size-navigation-bar);
    height: var(--size-navigation-bar);
    padding: 0;
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .stickers svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
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
    fill: currentColor;
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
    fill: currentColor;
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
    fill: currentColor;
  }
</style>
