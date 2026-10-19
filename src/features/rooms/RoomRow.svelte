<!--
  Одна строка списка чатов. Ссылка, а не кнопка: адрес чата — настоящий, его можно открыть
  средней кнопкой и положить в закладки.

  Превью — две строки, и место под вторую держится, даже когда она пуста: иначе столбец
  строк разной высоты читается так, будто список отсортирован по длине сообщения.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import UnreadBadge from '../../design/UnreadBadge.svelte';
  import { roomTimestamp } from '../../design/time';
  import { formatRoute } from '../../core/navigation/route';
  import { emphasisOf, hasUnread, type RoomSummary } from '../../core/rooms/types';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { i18n, t } from '../../i18n/index.svelte.ts';
  import RoomFace from './RoomFace.svelte';
  import { longPress } from '../room/gestures';
  import { previewText, roomName, rowLabel } from './text';

  interface Props {
    room: RoomSummary;
    session: UserSession;
    selected: boolean;
    now: number;
    onopen?: (roomId: string) => void;
    /** Меню строки: у точки — мышью и с клавиатуры, листом (`sheet`) — пальцем. */
    onmenu?: (at: { x: number; y: number }, sheet: boolean) => void;
  }
  let { room, session, selected, now, onopen, onmenu }: Props = $props();

  /**
   * Правый щелчок — у указателя. С клавиатуры у события нет точки — тогда под строкой.
   */
  function oncontextmenu(event: MouseEvent) {
    if (!onmenu) return;
    event.preventDefault();
    const fromKeyboard = event.button !== 2 || (event.clientX === 0 && event.clientY === 0);
    if (fromKeyboard) menuUnder(event.currentTarget as HTMLElement);
    else onmenu({ x: event.clientX, y: event.clientY }, false);
  }

  /** `Shift F10` и клавиша меню — сами, как у сообщения в ленте: не каждый браузер шлёт на них `contextmenu`. */
  function onkeydown(event: KeyboardEvent) {
    if (!onmenu || !(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) return;
    event.preventDefault();
    menuUnder(event.currentTarget as HTMLElement);
  }

  function menuUnder(row: HTMLElement) {
    const rect = row.getBoundingClientRect();
    onmenu?.({ x: rect.left + rect.height / 2, y: rect.bottom }, false);
  }

  const number = $derived(new Intl.NumberFormat(i18n.locale));
  /** Черновик — на месте последнего сообщения; в открытом чате он и так перед глазами. */
  const draft = $derived(selected ? undefined : session.drafts[room.id]?.replace(/\s+/g, ' ').trim());
  /** В группе — кто сказал, отдельной строкой над словами; в личном чате это и так понятно. */
  const sender = $derived(room.kind === 'group' ? room.lastSender : undefined);
</script>

<a
  class="row"
  href={formatRoute({ name: 'room', roomId: room.id })}
  aria-current={selected ? 'page' : undefined}
  aria-label={rowLabel(room, draft)}
  data-room-id={room.id}
  {oncontextmenu}
  {onkeydown}
  use:longPress={(at) => onmenu?.(at, true)}
  onclick={(event) => {
    if (!onopen || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onopen(room.id);
  }}
>
  <RoomFace {room} {session} />
  <span class="body">
    <span class="line">
      <span class="name">{roomName(room)}</span>
      {#if room.encrypted}
        <svg class="lock" viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.lock} /></svg>
      {/if}
      <span class="spacer"></span>
      {#if room.isFavourite}
        <svg class="pin" viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.pin} /></svg>
      {/if}
      {#if room.lastMark && !room.typing}
        <span class="mark" data-mark={room.lastMark}>
          {#if room.lastMark === 'sending'}
            <svg viewBox={ICON_VIEWBOX} role="img" aria-label={t('message.delivery.sending')}><path d={icons.sending} /></svg>
          {:else if room.lastMark === 'read'}
            <svg viewBox={ICON_VIEWBOX} role="img" aria-label={t('message.delivery.read')}><path d={icons.read} /></svg>
          {:else if room.lastMark === 'sent'}
            <svg viewBox={ICON_VIEWBOX} role="img" aria-label={t('message.delivery.sent')}><path d={icons.check} /></svg>
          {:else}
            <svg viewBox={ICON_VIEWBOX} role="img" aria-label={t('message.delivery.failed')}><path d={icons.failed} /></svg>
          {/if}
        </span>
      {/if}
      {#if room.lastActivity}
        <time class="time">{roomTimestamp(room.lastActivity, now, i18n.locale, t('room.yesterday'))}</time>
      {/if}
    </span>
    <span class="line top">
      {#if room.typing}
        <span class="preview typing">{t('room.typing')}</span>
      {:else if draft}
        <span class="preview draft">{t('roomList.draft', { text: draft })}</span>
      {:else}
        <span class="preview"
          >{#if sender}<span class="sender">{sender}</span><span class="colon">:</span><br class="break" />{/if}{previewText(room.preview)}</span
        >
      {/if}
      {#if hasUnread(room) || room.mentionCount > 0 || room.unreadReactions > 0}
        <UnreadBadge
          count={room.unreadCount}
          unread={hasUnread(room)}
          reacted={room.unreadReactions > 0}
          mentioned={room.mentionCount > 0}
          muted={emphasisOf(room) === 'muted'}
          format={(n) => number.format(n)}
        />
      {/if}
    </span>
  </span>
</a>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    min-height: var(--row-room);
    padding: var(--space-close) var(--space-normal);
    margin-inline: var(--space-tight);
    border-radius: var(--radius-control);
    color: inherit;
    text-decoration: none;
    /* Пятьсот комнат — не беда: строки вне экрана не раскладываются и не рисуются. */
    content-visibility: auto;
    contain-intrinsic-size: auto var(--row-room);
    /* Долгое нажатие — наше меню, а не системное «Открыть ссылку» поверх (iOS). */
    -webkit-touch-callout: none;
  }
  /* Наведение — только там, где указатель умеет наводиться: на телефоне тап оставлял бы «залипшую» подсветку. */
  @media (hover: hover) {
    .row:hover {
      background: var(--color-incoming-bubble);
    }
  }
  .row[aria-current='page'] {
    background: var(--color-selected);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    flex: 1;
    min-width: 0;
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-tight);
    min-width: 0;
  }
  .line.top {
    align-items: flex-start;
    gap: var(--space-close);
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .spacer {
    flex: 1;
  }
  .mark {
    display: flex;
    flex: none;
    color: var(--accent);
  }
  .mark[data-mark='sending'] {
    color: var(--color-text-secondary);
  }
  .mark[data-mark='failed'] {
    color: var(--color-danger);
  }
  .mark svg {
    width: var(--font-size-caption);
    height: var(--font-size-caption);
    fill: currentColor;
  }
  .lock,
  .pin {
    flex: none;
    width: var(--font-size-caption);
    height: var(--font-size-caption);
    fill: currentColor;
  }
  .lock {
    color: var(--color-text-secondary);
  }
  .pin {
    color: var(--accent);
  }
  .time {
    flex: none;
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  .preview {
    flex: 1;
    min-width: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    min-height: calc(2em * var(--line-height-body));
    font-size: var(--font-size-caption);
    line-height: var(--line-height-body);
    color: var(--color-text-secondary);
    overflow-wrap: anywhere;
  }
  .sender {
    color: var(--color-text);
  }
  /* Двоеточие — со своим отступом: пробел в конце строчного элемента браузер съедал. */
  .colon {
    display: none;
    margin-inline-end: var(--space-tight);
  }
  .typing {
    color: var(--accent);
  }
  .draft {
    font-style: italic;
  }
  /* Под мышью строка ниже — одна строка превью, и место под вторую не держим; автор — тогда
     в той же строке, через двоеточие, как в боковой панели нативной. */
  @media (hover: hover) and (pointer: fine) {
    .preview {
      -webkit-line-clamp: 1;
      line-clamp: 1;
      min-height: calc(1em * var(--line-height-body));
    }
    .colon {
      display: inline;
    }
    .break {
      display: none;
    }
  }
</style>
