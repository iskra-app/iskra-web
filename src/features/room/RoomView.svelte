<!--
  Открытый чат: полоса о смене ключей, полоса закреплённого, лента, «печатает…», композер. Лента создаётся при
  открытии и уничтожается при уходе — стор живёт ровно столько, сколько чат на экране.

  Здесь же сходятся действия над сообщением (`MessageActions`): ответ и правка — в
  композер, удаление — через вопрос «удалить у всех?», остальное — в ленту. И черновик:
  читается при открытии, пишется, пока печатают, и при уходе из чата — чтобы переключение
  между чатами на десктопе его не теряло.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import ConfirmDialog from '../../design/ConfirmDialog.svelte';
  import type { OutgoingFile } from '../../core/media/upload';
  import { fileSize } from '../media/files';
  import { prepareFile, stickerFile } from '../media/prepare';
  import Menu from '../../design/Menu.svelte';
  import { viewport } from '../../design/viewport.svelte.ts';
  import { stickerOf, type Sticker } from '../../core/stickers/imagePack';
  import StickerPanel from './StickerPanel.svelte';
  import { showsStickers } from './stickers';
  import type { Recording } from '../media/voiceRecorder.svelte.ts';
  import { VideoNoteRecorder } from '../media/videoNoteRecorder.svelte.ts';
  import { VIDEO_NOTE_SIDE } from '../media/videoNote';
  import VideoNoteCapture from './VideoNoteCapture.svelte';
  import Viewer, { type ViewerItem } from '../media/Viewer.svelte';
  import type { Message } from '../../core/timeline/message';
  import { router } from '../../core/navigation/router.svelte.ts';
  import { threadsShownIn } from './threads';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import type { Reactor, TimelineStore } from '../../core/timeline/timelineStore.svelte.ts';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import type { ComposerContext, MessageActions } from './actions';
  import Composer from './Composer.svelte';
  import PollComposer from './PollComposer.svelte';
  import SelectionBar from './SelectionBar.svelte';
  import ForwardDialog from './ForwardDialog.svelte';
  import ReactorsDialog from './ReactorsDialog.svelte';
  import ReportDialog from './ReportDialog.svelte';
  import { canForward } from '../../core/timeline/forward';
  import { membersOf } from '../../core/timeline/album';
  import { inTimelineOrder, selectionTranscript } from '../../core/timeline/selection';
  import { SvelteSet } from 'svelte/reactivity';
  import MessageMenu from './MessageMenu.svelte';
  import PinnedStrip from './PinnedStrip.svelte';
  import PinnedDialog from './PinnedDialog.svelte';
  import IdentityBanner from './IdentityBanner.svelte';
  import type { IdentityChangesStore } from '../../core/encryption/identityChanges.svelte.ts';
  import Timeline from './Timeline.svelte';
  import WallpaperBackdrop from './WallpaperBackdrop.svelte';
  import { distance } from './distance';
  import type { Place } from '../../core/timeline/location';
  import { preferences } from '../app/preferences.svelte.ts';
  import { revealRequest } from '../app/revealRequest.svelte.ts';
  import { profileRequest } from './profileRequest.svelte.ts';
  import { unlinkMentions, type ComposerMention } from '../../core/timeline/composerMentions';
  import { Photo, pixelsFor } from '../rooms/faces.svelte.ts';
  import type { MentionRow } from './MentionPicker.svelte';

  interface Props {
    session: UserSession;
    roomId: string;
    /** Лента чата — наружу, для вкладок «О чате»: они читают то, что она загрузила. */
    store?: TimelineStore;
    /** Это тред под сообщением (ID корня), а не сам чат: та же лента, только его ответы. */
    thread?: string;
  }
  let { session, roomId, store = $bindable(), thread }: Props = $props();
  /** Черновик треда — свой, рядом с черновиком чата. */
  const draftKey = $derived(thread ? `${roomId}#${thread}` : roomId);

  const DRAFT_SAVE_MS = 400;

  let composer: Composer | undefined = $state();
  /** Открыт список «Закреплённые». */
  let pinnedList = $state(false);
  let timeline: Timeline | undefined = $state();

  // Открыли из поиска — лента открывается на найденном. Чат уже был открыт — к нему же.
  const openAt = untrack(() => (thread ? undefined : revealRequest.take(roomId)));
  $effect(() => {
    if (!timeline || thread || revealRequest.pending?.roomId !== roomId) return;
    const eventId = revealRequest.take(roomId);
    if (eventId) void timeline.reveal(eventId);
  });

  let text = $state('');
  let context = $state<ComposerContext>(null);
  /** Черновик, отложенный на время правки: правка — не черновик. */
  let stashed = '';
  /** Кто стоит за `@Имя` в черновике — см. `composerMentions.ts`. */
  let mentions = $state<ComposerMention[]>([]);
  let stashedMentions: ComposerMention[] = [];
  let menu = $state<{ message: Message; at: { x: number; y: number }; sheet: boolean } | null>(null);
  let deleting = $state<Message | null>(null);
  /** Кто отреагировал — открытое окно; `null` — закрыто. */
  let reactorsOf = $state<Reactor[] | null>(null);
  /** На что жалуются; `null` — окно закрыто. */
  let reporting = $state<Message | null>(null);
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

  /** Альбом выбирается, пересылается и удаляется целиком — всеми своими фото. */
  function toggleSelected(message: Message) {
    if (!selection) return;
    const keys = membersOf(message).map((m) => m.key);
    if (selection.has(message.key)) for (const key of keys) selection.delete(key);
    else for (const key of keys) selection.add(key);
  }

  function copySelection() {
    if (transcript) void navigator.clipboard?.writeText(transcript).catch(() => {});
    selection = null;
  }
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

  // Служебные строки — по настройкам «Чаты»: лента перекладывается сразу, без перезагрузки.
  $effect(() => {
    store?.setServiceHiding({ nameChanges: preferences.hideNameChanges, membership: preferences.hideMembershipChanges });
  });

  $effect(() => {
    const id = draftKey;
    const created = session.timeline(roomId, thread);
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
      composer?.cancelRecording();
      videoNote.cancel();
      clearTimeout(saveTimer);
      if (loaded) void session.saveDraft(id, draftText());
      created.destroy();
    };
  });

  $effect(() => {
    void roomId;
    composer?.focus();
  });

  /** Кто здесь сменил ключи — живёт, пока открыт чат, как и лента. */
  let identities = $state<IdentityChangesStore | null>(null);
  $effect(() => {
    // В треде о сменивших ключи не говорим: это сказано над самим чатом.
    if (thread) return;
    const created = session.identityChanges(roomId);
    identities = created;
    return () => {
      created.destroy();
      if (identities === created) identities = null;
    };
  });
  const identityChange = $derived(identities?.changes[0]);

  async function acknowledgeIdentity() {
    const change = identityChange;
    if (!change || !identities) return;
    try {
      await identities.acknowledge(change);
    } catch {
      notice = t('room.identity.failed');
    }
  }

  const room = $derived(session.rooms.get(roomId));
  /** Треды в этом чате — `ThreadSettings` нативной: не в личном, и по настройке «Чаты». */
  const usesThreads = $derived(!thread && !!room && room.kind !== 'direct' && threadsShownIn(room.memberCount));
  $effect(() => {
    store?.setThreads({ enabled: usesThreads, hidesReplies: preferences.threadsHideReplies });
  });

  /** Собеседник личного чата, если вы его заблокировали: в группе один заблокированный писать не мешает. */
  const blockedId = $derived(room?.kind === 'direct' && room.counterpartId && session.blocked.has(room.counterpartId) ? room.counterpartId : undefined);
  const canSend = $derived(room?.membership === 'join' || (!room && session.canSend(roomId)));

  // ————— Черновик и «печатает» —————

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const draftText = () => (context?.kind === 'edit' ? stashed : text);

  function oninput(value: string) {
    if (context?.kind !== 'edit') {
      // Скрыл «печатает…» — о наборе никому не говорим; остановку — тоже незачем.
      if (preferences.hideTyping) return;
      if (value.trim()) store?.typingActive();
      else store?.typingStopped();
    }
    clearTimeout(saveTimer);
    const id = draftKey;
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
    void session.saveDraft(draftKey, text);
  }

  /**
   * Голосовое — тем же путём, что вложения (`sendFiles` → `core/media/upload.ts`): в
   * зашифрованной комнате оно шифруется, как фото. Имя — для клиентов, которые голосовых не
   * понимают: им покажут файл «Голосовое сообщение.m4a», а не случайные буквы.
   */
  function onvoice(recording: Recording) {
    if (!store) return;
    store.sendFiles(
      [
        {
          blob: recording.blob,
          name: `${t('preview.voice')}.m4a`,
          mimetype: recording.mimetype,
          kind: 'audio',
          duration: recording.duration,
          voice: { waveform: recording.waveform },
        },
      ],
      undefined,
      context?.kind === 'reply' ? context.message : undefined,
    );
    if (context?.kind === 'reply') context = null;
  }

  // ————— «Кружочек» —————

  /** Один на открытый чат: камеру держит он, слой камеры — здесь, поверх комнаты. */
  const videoNote = new VideoNoteRecorder();
  let videoHolding = $state(false);

  /**
   * Отправить снятое — тем же путём, что вложения: в зашифрованной комнате шифруется. Квадрат
   * 480 и до минуты — по этому «кружочек» и узнают, своих полей в событии нет.
   */
  async function finishVideoNote() {
    videoHolding = false;
    const replyTo = context?.kind === 'reply' ? context.message : undefined;
    const take = await videoNote.finish();
    if (!take || !store) return;
    store.sendFiles(
      [
        {
          blob: take.blob,
          name: `${t('videoNote.title')}.mp4`,
          mimetype: take.mimetype,
          kind: 'video',
          width: VIDEO_NOTE_SIDE,
          height: VIDEO_NOTE_SIDE,
          duration: take.duration,
          ...(take.thumbnail ? { thumbnail: { blob: take.thumbnail, width: VIDEO_NOTE_SIDE, height: VIDEO_NOTE_SIDE, mimetype: 'image/jpeg' } } : {}),
        },
      ],
      undefined,
      replyTo,
    );
    if (replyTo) context = null;
  }

  /** Панель стикеров — у кнопки в поле, где её нажали. */
  let stickerPanel = $state<{ x: number; y: number } | null>(null);

  /** Стикер выбран: панель закрывается сразу, стикер уходит следом — с ответом, если отвечали. */
  async function sendSticker(sticker: Sticker) {
    stickerPanel = null;
    const target = store;
    if (!target) return;
    const replyTo = context?.kind === 'reply' ? context.message : undefined;
    if (replyTo) context = null;
    const sent = await target.sendSticker(sticker, replyTo, async () => stickerFile(await session.media.blob({ mxc: sticker.url }, sticker.mimetype ?? 'image/png'), sticker.body));
    if (sent) session.stickers.used(sticker);
  }

  function cancelVideoNote() {
    videoHolding = false;
    composer?.cancelRecording();
    videoNote.cancel();
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
    const settings = { stripMetadata: preferences.stripMetadata, compress: preferences.compress, compression: preferences.compression };
    const prepared = await Promise.all(fitting.map((file) => prepareFile(file, settings)));
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

  // ————— Действия —————

  const actions: MessageActions = {
    get canReply() {
      return canSend;
    },
    get showsReactors() {
      return room?.kind !== 'direct';
    },
    openProfile: (userId: string) => profileRequest.open(roomId, userId),
    get openThread() {
      return usesThreads ? (message: Message) => message.eventId && router.go({ name: 'room', roomId, thread: message.eventId }) : undefined;
    },
    reactors: (message) => (reactorsOf = store?.reactors(message) ?? []),
    report: (message) => (reporting = message),
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
    select: (message) => (selection = new SvelteSet(membersOf(message).map((m) => m.key))),
    forward: (message) => (forwarding = membersOf(message)),
    pin: (message) => store?.pin(message),
    unpin: (message) => store?.unpin(message),
    remove: (message) => (deleting = message),
    retry: (key) => store?.retry(key),
    sendAnyway: (key) => store?.sendAnyway(key),
    discard: (key) => store?.discard(key),
    openMenu: (message, at, sheet) => (menu = { message, at, sheet }),
    stickerIsMine: (message) => {
      const sticker = message.kind.type === 'sticker' ? stickerOf(message.kind.attachment) : undefined;
      return sticker ? session.stickers.isMine(sticker.url) : undefined;
    },
    toggleSticker: (message) => {
      const sticker = message.kind.type === 'sticker' ? stickerOf(message.kind.attachment) : undefined;
      if (!sticker) return;
      void (session.stickers.isMine(sticker.url) ? session.stickers.remove(sticker) : session.stickers.add(sticker));
    },
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
  /**
   * `Esc`, которое не забрали меню, окна и полоса ответа над полем (у них своё): выйти из
   * выбора, если он есть, — и `true`. `false` — закрывать здесь нечего, закрывается сам чат,
   * как в нативной Искре на Mac.
   */
  export function escape(): boolean {
    if (!selection) return false;
    selection = null;
    return true;
  }

  /** Из панели «О чате»: к закреплённому сообщению или найденному в поиске по чату. */
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
  <!-- Над закреплённым: это о том, кто прочтёт написанное здесь, — важнее того, что закрепили. -->
  {#if identityChange}
    {#key identityChange.userId}
      <IdentityBanner change={identityChange} onacknowledge={() => void acknowledgeIdentity()} />
    {/key}
  {/if}
  {#if store && store.pinnedIds.length && !thread}
    <PinnedStrip
      message={store.pinnedMessage}
      count={store.pinnedIds.length}
      onjump={() => store?.pinnedMessage?.eventId && void timeline?.reveal(store.pinnedMessage.eventId)}
      onlist={() => (pinnedList = true)}
    />
    <PinnedDialog
      open={pinnedList}
      {session}
      {roomId}
      direct={room?.kind === 'direct'}
      canUnpin={store.canPin}
      onjump={(eventId) => {
        pinnedList = false;
        void timeline?.reveal(eventId);
      }}
      onunpin={(eventId) => store?.unpinEvent(eventId)}
      onclose={() => (pinnedList = false)}
    />
  {/if}
  {#if store}
    {#key store}
      <Timeline bind:this={timeline} {store} {session} {openAt} showSenders={room?.kind !== 'direct'} {actions} {selection} ontoggle={toggleSelected} />
    {/key}
  {/if}
  {#if videoNote.open}
    <VideoNoteCapture recorder={videoNote} holding={videoHolding} onsend={() => void finishVideoNote()} oncancel={cancelVideoNote} />
  {/if}
  <div class="below">
    {#if notice}
      <div class="failure" role="alert">
        <span>{notice}</span>
        <button type="button" onclick={() => (notice = '')}>{t('timeline.dismiss')}</button>
      </div>
    {/if}
    {#if store?.failure}
      <div class="failure" role="alert">
        <span>{store.failure === 'sendAnywayFailed' ? t('message.delivery.sendAnywayFailed') : t(`timeline.${store.failure}`)}</span>
        <button type="button" onclick={() => store?.dismissFailure()}>{t('timeline.dismiss')}</button>
      </div>
    {/if}
    {#if session.stickers.failure}
      <div class="failure" role="alert">
        <span>{t(`stickers.${session.stickers.failure}Failed`)}</span>
        <button type="button" onclick={() => session.stickers.dismissFailure()}>{t('timeline.dismiss')}</button>
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
  {:else if blockedId}
    <!-- Вместо поля — что происходит и как это отменить (`BlockedBanner` нативной): иначе чат
         выглядел бы как обычный, а собеседник — просто замолчавшим. -->
    <div class="instead" role="status">
      <p>{t('profile.blockedNotice')}</p>
      <button type="button" onclick={() => void session.blocked.unblock(blockedId)}>{t('settings.unblock')}</button>
    </div>
  {:else if store && !store.canPost}
    <div class="instead" role="status"><p>{t('room.readOnly')}</p></div>
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
    onlocation={thread ? undefined : locate}
    onpoll={room?.kind === 'direct' || thread ? undefined : () => (creatingPoll = true)}
    onstickers={showsStickers() ? (at) => (stickerPanel = at) : undefined}
    {onvoice}
    {videoNote}
    bind:videoHolding
    onfinishvideonote={() => void finishVideoNote()}
    onvoiceproblem={(problem) => (notice = problem === 'denied' ? t('voice.needsMicrophone') : t('voice.failed'))}
  />
  {/if}
</div>

<Menu open={!!stickerPanel} x={stickerPanel?.x ?? 0} y={stickerPanel?.y ?? 0} sheet={!viewport.finePointer} label={t('stickers.title')} onclose={() => (stickerPanel = null)}>
  {#if stickerPanel}
    <StickerPanel library={session.stickers} media={session.media} {roomId} onpick={(sticker) => void sendSticker(sticker)} />
  {/if}
</Menu>

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
    if (deleting) for (const message of membersOf(deleting)) store?.remove(message);
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

<ReactorsDialog reactors={reactorsOf} {session} onclose={() => (reactorsOf = null)} />

<ReportDialog message={reporting} onreport={(message, reason) => store?.report(message, reason)} onclose={() => (reporting = null)} />

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
  .instead {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-tight);
    max-width: var(--column-timeline-max);
    width: 100%;
    margin-inline: auto;
    padding: var(--space-normal) var(--timeline-gutter) max(var(--space-normal), env(safe-area-inset-bottom));
    border-block-start: var(--border-hairline) solid var(--color-separator);
    text-align: center;
  }
  .instead p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .instead button {
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    border: none;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
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
