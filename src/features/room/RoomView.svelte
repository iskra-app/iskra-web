<!--
  Открытый чат: полоса закреплённого, лента, «печатает…», композер. Лента создаётся при
  открытии и уничтожается при уходе — стор живёт ровно столько, сколько чат на экране.

  Здесь же сходятся действия над сообщением (`MessageActions`): ответ и правка — в
  композер, удаление — через вопрос «удалить у всех?», остальное — в ленту. И черновик:
  читается при открытии, пишется, пока печатают, и при уходе из чата — чтобы переключение
  между чатами на десктопе его не теряло.
-->
<script lang="ts">
  import ConfirmDialog from '../../design/ConfirmDialog.svelte';
  import type { OutgoingFile } from '../../core/media/upload';
  import { fileSize } from '../media/files';
  import { prepareFile } from '../media/prepare';
  import Viewer, { type ViewerItem } from '../media/Viewer.svelte';
  import type { Message } from '../../core/timeline/message';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import type { TimelineStore } from '../../core/timeline/timelineStore.svelte.ts';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import type { ComposerContext, MessageActions } from './actions';
  import Composer from './Composer.svelte';
  import PollComposer from './PollComposer.svelte';
  import SelectionBar from './SelectionBar.svelte';
  import ForwardDialog from './ForwardDialog.svelte';
  import { canForward } from '../../core/timeline/forward';
  import { inTimelineOrder, selectionTranscript } from '../../core/timeline/selection';
  import { SvelteSet } from 'svelte/reactivity';
  import MessageMenu from './MessageMenu.svelte';
  import PinnedStrip from './PinnedStrip.svelte';
  import { typingText } from './text';
  import Timeline from './Timeline.svelte';
  import WallpaperBackdrop from './WallpaperBackdrop.svelte';
  import { distance } from './distance';
  import type { Place } from '../../core/timeline/location';
  import { preferences } from '../app/preferences.svelte.ts';
  import { unlinkMentions, type ComposerMention } from '../../core/timeline/composerMentions';
  import { Photo, pixelsFor } from '../rooms/faces.svelte.ts';
  import type { MentionRow } from './MentionPicker.svelte';

  interface Props {
    session: UserSession;
    roomId: string;
    /** Лента чата — наружу, для вкладок «О чате»: они читают то, что она загрузила. */
    store?: TimelineStore;
  }
  let { session, roomId, store = $bindable() }: Props = $props();

  /** Сколько «печатает…» держится после того, как все перестали: сообщение вот-вот придёт. */
  const TYPING_GRACE_MS = 700;
  const DRAFT_SAVE_MS = 400;

  let composer: Composer | undefined = $state();
  let timeline: Timeline | undefined = $state();

  let text = $state('');
  let context = $state<ComposerContext>(null);
  /** Черновик, отложенный на время правки: правка — не черновик. */
  let stashed = '';
  /** Кто стоит за `@Имя` в черновике — см. `composerMentions.ts`. */
  let mentions = $state<ComposerMention[]>([]);
  let stashedMentions: ComposerMention[] = [];
  let menu = $state<{ message: Message; at: { x: number; y: number }; sheet: boolean } | null>(null);
  let deleting = $state<Message | null>(null);
  let endingPoll = $state<Message | null>(null);
  let creatingPoll = $state(false);
  /** Выбранные сообщения — ключи, пока выбирают; `null` почти всегда. См. `selection.ts`. */
  let selection = $state<SvelteSet<string> | null>(null);
  let deletingSelection = $state(false);
  /** Что пересылают — одно из меню или выбранные; `null` — окно закрыто. */
  let forwarding = $state<Message[] | null>(null);

  async function forwardTo(roomIds: string[], comment: string) {
    const messages = forwarding ?? [];
    forwarding = null;
    selection = null;
    if (!(await session.forward(messages, roomIds, comment))) notice = t('message.forward.failed');
  }
  const chosen = $derived(selection && store ? inTimelineOrder(store.messages, selection) : []);
  const transcript = $derived(
    selectionTranscript(chosen, (ts) => new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'short', timeStyle: 'short' }).format(ts)),
  );

  function toggleSelected(message: Message) {
    if (!selection) return;
    if (selection.has(message.key)) selection.delete(message.key);
    else selection.add(message.key);
  }

  function copySelection() {
    if (transcript) void navigator.clipboard?.writeText(transcript).catch(() => {});
    selection = null;
  }
  let blocking = $state<Message | null>(null);
  let attachments = $state<OutgoingFile[]>([]);
  let dropping = $state(false);
  /** Строка над полем: не влезло в лимит, не нашли место — сказать и дать закрыть. */
  let notice = $state('');
  /** Место, которое браузер назвал, — ждёт «Отправить». */
  let placing = $state<Place | null>(null);
  let locating = $state(false);

  /**
   * Где я. Браузер спросит разрешение сам — при первом нажатии, а не при входе: вопрос без
   * повода получает «нет» навсегда. Точность — из ответа, и она идёт в вопрос перед отправкой:
   * без GPS место по сети бывает мимо на город, и человек должен это знать до, а не после.
   */
  function locate() {
    if (!navigator.geolocation || locating) return;
    locating = true;
    notice = '';
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locating = false;
        notice = '';
        const { latitude, longitude, accuracy } = position.coords;
        placing = { latitude, longitude, ...(Number.isFinite(accuracy) ? { accuracy } : {}) };
      },
      (error) => {
        locating = false;
        notice = error.code === error.PERMISSION_DENIED ? t('location.denied') : t('location.failed');
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  }
  let viewing = $state<{ items: ViewerItem[]; start: string } | null>(null);

  $effect(() => {
    const id = roomId;
    const created = session.timeline(id);
    store = created;
    text = '';
    context = null;
    stashed = '';
    mentions = [];
    stashedMentions = [];
    selection = null;
    attachments = [];
    notice = '';
    let loaded = false;
    void session.draft(id).then((draft) => {
      loaded = true;
      // Человек успел начать печатать — его текст важнее вчерашнего черновика.
      if (store === created && text === '' && draft) text = draft;
    });
    return () => {
      clearTimeout(saveTimer);
      if (loaded) void session.saveDraft(id, draftText());
      created.destroy();
    };
  });

  $effect(() => {
    void roomId;
    composer?.focus();
  });

  const room = $derived(session.rooms.get(roomId));
  const canSend = $derived(room?.membership === 'join' || (!room && session.canSend(roomId)));

  // ————— Черновик и «печатает» —————

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const draftText = () => (context?.kind === 'edit' ? stashed : text);

  function oninput(value: string) {
    if (context?.kind !== 'edit') {
      if (value.trim()) store?.typingActive();
      else store?.typingStopped();
    }
    clearTimeout(saveTimer);
    const id = roomId;
    saveTimer = setTimeout(() => void session.saveDraft(id, draftText()), DRAFT_SAVE_MS);
  }

  function onsend(value: string) {
    if (!store) return;
    if (attachments.length && context?.kind !== 'edit') {
      // Текст — подпись к первому вложению; ответ — тоже с ним.
      store.sendFiles(attachments, value, context?.kind === 'reply' ? context.message : undefined);
      attachments = [];
      text = '';
      mentions = [];
    } else if (context?.kind === 'edit') {
      store.edit(context.message, value, mentions);
      text = stashed;
      stashed = '';
      mentions = stashedMentions;
      stashedMentions = [];
    } else {
      store.send(value, context?.kind === 'reply' ? context.message : undefined, mentions);
      text = '';
      mentions = [];
    }
    context = null;
    clearTimeout(saveTimer);
    void session.saveDraft(roomId, text);
  }

  function edit(message: Message) {
    if (!message.canEdit || !('body' in message.kind)) return;
    if (context?.kind !== 'edit') {
      stashed = text;
      stashedMentions = mentions;
    }
    context = { kind: 'edit', message };
    // В теле своего — Markdown, каким оно ушло: упоминания — снова `@Имя` с записью рядом.
    ({ text, mentions } = unlinkMentions(message.kind.body));
  }

  function cancelContext() {
    if (context?.kind === 'edit') {
      text = stashed;
      stashed = '';
      mentions = stashedMentions;
      stashedMentions = [];
    }
    context = null;
  }

  // ————— «@» —————

  /** Звать через «@» — в группе. В личном чате звать некого, кроме того, кто и так слушает. */
  const mentionCandidates = $derived(room?.kind === 'direct' ? undefined : () => store?.mentionCandidates() ?? []);
  // Кэш фото на время жизни чата.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const photos = new Map<string, Photo>();
  function mentionPhoto(member: MentionRow): string | undefined {
    const url = member.avatarUrl;
    if (!url) return undefined;
    let photo = photos.get(url);
    if (!photo) {
      photo = new Photo(session, url, pixelsFor(2.5));
      photos.set(url, photo);
    }
    return photo.url;
  }

  // ————— Вложения —————

  /** Выбрали, вставили или перетащили — посчитать размеры и миниатюры и положить в лоток. */
  async function addFiles(files: File[]) {
    const limit = await session.uploadLimit();
    const fitting = files.filter((file) => {
      if (limit === undefined || file.size <= limit) return true;
      notice = t('upload.tooLarge', { name: file.name, limit: fileSize(limit, i18n.locale) });
      return false;
    });
    if (fitting.length === files.length) notice = '';
    const prepared = await Promise.all(fitting.map(prepareFile));
    attachments = [...attachments, ...prepared];
  }

  /** Перетаскивание: подсвечивается вся колонка чата, а не маленькая мишень. */
  const carriesFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes('Files');
  let dragDepth = 0;
  function ondragenter(event: DragEvent) {
    if (!carriesFiles(event) || !canSend) return;
    event.preventDefault();
    dragDepth++;
    dropping = true;
  }
  function ondragover(event: DragEvent) {
    if (!carriesFiles(event) || !canSend) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }
  function ondragleave() {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropping = false;
  }
  function ondrop(event: DragEvent) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    dropping = false;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length && canSend) void addFiles(files);
  }

  /** `Ctrl/⌘ Shift U`. */
  export function attach(): void {
    composer?.attach();
  }

  // ————— «Печатает…» с задержкой —————

  let showTyping = $state(false);
  let typingLine = $state('');
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const names = store?.typing ?? [];
    clearTimeout(hideTimer);
    if (names.length) {
      typingLine = typingText(names);
      showTyping = true;
    } else {
      // Уведомления о наборе — поток мелкой неточности: «никто» между двумя «печатает»
      // мигало бы строкой. Прячем с небольшой задержкой.
      hideTimer = setTimeout(() => (showTyping = false), TYPING_GRACE_MS);
    }
    return () => clearTimeout(hideTimer);
  });

  // ————— Действия —————

  const actions: MessageActions = {
    get canReply() {
      return canSend;
    },
    get canPin() {
      return !!store?.canPin;
    },
    reply: (message) => {
      if (context?.kind === 'edit') text = stashed;
      context = { kind: 'reply', message };
    },
    edit,
    react: (message, key) => store?.react(message, key),
    vote: (message, ids) => store?.vote(message, ids),
    endPoll: (message) => (endingPoll = message),
    select: (message) => (selection = new SvelteSet([message.key])),
    forward: (message) => (forwarding = [message]),
    pin: (message) => store?.pin(message),
    unpin: (message) => store?.unpin(message),
    remove: (message) => (deleting = message),
    block: (message) => (blocking = message),
    retry: (key) => store?.retry(key),
    discard: (key) => store?.discard(key),
    openMenu: (message, at, sheet) => (menu = { message, at, sheet }),
    openMedia: (message) => {
      // Листается всё, что в комнате загружено: фото, видео, «кружочки» — по порядку ленты.
      const items: ViewerItem[] = (store?.messages ?? []).flatMap((m) =>
        (m.kind.type === 'image' || m.kind.type === 'video' || m.kind.type === 'videoNote') && m.kind.attachment.source
          ? [{ key: m.key, kind: m.kind.type, attachment: m.kind.attachment }]
          : [],
      );
      if (items.some((i) => i.key === message.key)) viewing = { items, start: message.key };
    },
  };

  /** `↑` в пустом композере. */
  function editLast(): boolean {
    const last = store?.lastEditable();
    if (!last) return false;
    edit(last);
    return true;
  }

  /** `Esc` в чате, когда закрывать нечего: вниз и прочитано. */
  export function escape(): void {
    // Сначала — выйти из выбора: это то, что сейчас на экране.
    if (selection) {
      selection = null;
      return;
    }
    timeline?.toBottom();
  }

  /** Из панели «О чате»: к закреплённому сообщению. */
  export function reveal(eventId: string): void {
    void timeline?.reveal(eventId);
  }

    /** `Page Up` / `Page Down` — листать ленту, даже когда фокус в композере. */
  export function page(direction: -1 | 1): void {
    timeline?.page(direction);
  }
</script>

<div
  class="room"
  role="region"
  aria-label={t('room.timeline')}
  data-wallpaper={preferences.wallpaper === 'none' ? undefined : ''}
  {ondragenter}
  {ondragover}
  {ondragleave}
  {ondrop}
>
  <WallpaperBackdrop />
  {#if dropping}
    <div class="drop" aria-hidden="true"><span>{t('room.dropToAttach')}</span></div>
  {/if}
  {#if store && store.pinnedIds.length}
    <PinnedStrip
      message={store.pinnedMessage}
      canUnpin={store.canPin}
      onjump={() => store?.pinnedMessage?.eventId && void timeline?.reveal(store.pinnedMessage.eventId)}
      onunpin={() => store?.pinnedMessage && store.unpin(store.pinnedMessage)}
    />
  {/if}
  {#if store}
    {#key store}
      <Timeline bind:this={timeline} {store} {session} showSenders={room?.kind !== 'direct'} {actions} {selection} ontoggle={toggleSelected} />
    {/key}
  {/if}
  <div class="below">
    <p class="typing" aria-live="polite">{showTyping ? typingLine : ''}</p>
    {#if notice}
      <div class="failure" role="alert">
        <span>{notice}</span>
        <button type="button" onclick={() => (notice = '')}>{t('timeline.dismiss')}</button>
      </div>
    {/if}
    {#if store?.failure}
      <div class="failure" role="alert">
        <span>{t(`timeline.${store.failure}`)}</span>
        <button type="button" onclick={() => store?.dismissFailure()}>{t('timeline.dismiss')}</button>
      </div>
    {/if}
    {#if session.blocked.failure === 'blockFailed'}
      <div class="failure" role="alert">
        <span>{t('account.blockFailed')}</span>
        <button type="button" onclick={() => session.blocked.dismissFailure()}>{t('timeline.dismiss')}</button>
      </div>
    {/if}
  </div>
  {#if selection}
    <SelectionBar
      count={selection.size}
      canCopy={transcript !== null}
      canForward={chosen.length > 0 && chosen.every(canForward)}
      onforward={() => (forwarding = chosen)}
      canDelete={chosen.length > 0 && chosen.every((m) => m.canDelete)}
      oncancel={() => (selection = null)}
      oncopy={copySelection}
      ondelete={() => (deletingSelection = true)}
    />
  {:else}
  <Composer
    bind:this={composer}
    bind:text
    bind:mentions
    {mentionCandidates}
    {mentionPhoto}
    {context}
    disabled={!canSend}
    {onsend}
    {oninput}
    oncancelcontext={cancelContext}
    oneditlast={editLast}
    {attachments}
    onfiles={(files) => void addFiles(files)}
    onremoveattachment={(index) => (attachments = attachments.filter((_, i) => i !== index))}
    onlocation={locate}
    onpoll={room?.kind === 'direct' ? undefined : () => (creatingPoll = true)}
  />
  {/if}
</div>

{#if viewing}
  <Viewer items={viewing.items} start={viewing.start} media={session.media} onclose={() => (viewing = null)} />
{/if}

<MessageMenu message={menu?.message ?? null} at={menu?.at ?? { x: 0, y: 0 }} sheet={menu?.sheet ?? false} {actions} onclose={() => (menu = null)} />

<ConfirmDialog
  open={!!deleting}
  title={t('message.menu.deleteConfirmTitle')}
  message={t('message.menu.deleteConfirmMessage')}
  confirmLabel={t('message.menu.delete')}
  cancelLabel={t('common.cancel')}
  destructive
  onclose={() => (deleting = null)}
  onconfirm={() => {
    if (deleting) store?.remove(deleting);
    deleting = null;
  }}
/>

<ConfirmDialog
  open={deletingSelection}
  title={t('message.selection.deleteTitle')}
  message={t('message.selection.deleteMessage')}
  confirmLabel={t('message.menu.delete')}
  cancelLabel={t('common.cancel')}
  destructive
  onclose={() => (deletingSelection = false)}
  onconfirm={() => {
    for (const message of chosen) store?.remove(message);
    deletingSelection = false;
    selection = null;
  }}
/>

<ForwardDialog open={!!forwarding} {session} onsend={(ids, comment) => void forwardTo(ids, comment)} onclose={() => (forwarding = null)} />

<PollComposer
  open={creatingPoll}
  onclose={() => (creatingPoll = false)}
  onsend={(draft) => {
    store?.sendPoll(draft);
    creatingPoll = false;
  }}
/>

<ConfirmDialog
  open={!!endingPoll}
  title={t('poll.endConfirmTitle')}
  message={t('poll.endConfirmMessage')}
  confirmLabel={t('poll.end')}
  cancelLabel={t('common.cancel')}
  destructive
  onclose={() => (endingPoll = null)}
  onconfirm={() => {
    if (endingPoll) store?.endPoll(endingPoll, t('timeline.pollEndedBody'));
    endingPoll = null;
  }}
/>

<ConfirmDialog
  open={!!placing}
  title={t('location.confirm')}
  message={placing?.accuracy !== undefined ? t('location.accuracy', { distance: distance(placing.accuracy, i18n.locale) }) : t('location.accuracyUnknown')}
  confirmLabel={t('location.send')}
  cancelLabel={t('location.cancel')}
  onclose={() => (placing = null)}
  onconfirm={() => {
    if (placing) store?.sendLocation(placing, t('location.title'));
    placing = null;
  }}
/>

<ConfirmDialog
  open={!!blocking}
  title={t('message.menu.blockConfirm', { name: blocking?.senderName ?? '' })}
  message={t('message.menu.blockConfirmMessage')}
  confirmLabel={t('message.menu.block')}
  cancelLabel={t('common.cancel')}
  destructive
  onclose={() => (blocking = null)}
  onconfirm={() => {
    if (blocking) void session.blocked.block(blocking.senderId);
    blocking = null;
  }}
/>

<style>
  .room {
    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .drop {
    position: absolute;
    z-index: 5;
    inset: var(--space-close);
    display: grid;
    place-items: center;
    border: 2px dashed var(--accent);
    border-radius: var(--radius-card);
    background: color-mix(in srgb, var(--color-background) 85%, transparent);
    color: var(--accent);
    font-size: var(--font-size-title);
    font-weight: 600;
    pointer-events: none;
  }
  .below {
    max-width: var(--column-timeline-max);
    width: 100%;
    margin-inline: auto;
    padding-inline: var(--timeline-gutter);
  }
  .typing {
    min-height: calc(var(--font-size-caption) * var(--line-height-body));
    margin: 0;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  /* На обоях — на плашке, как имя отправителя (см. MessageRow). Пустая строка плашки не рисует. */
  [data-wallpaper] .typing:not(:empty) {
    width: fit-content;
    padding: 0 var(--space-close);
    border-radius: var(--radius-circle);
    background: var(--color-incoming-bubble);
  }
  .failure {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    margin-block-end: var(--space-tight);
    padding: var(--space-close) var(--space-normal);
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--color-danger) 12%, transparent);
    color: var(--color-danger);
    font-size: var(--font-size-caption);
  }
  .failure span {
    flex: 1;
  }
  .failure button {
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: inherit;
    font-weight: 600;
    cursor: pointer;
  }
</style>
