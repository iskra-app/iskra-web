<!--
  Лента: прокрутка с якорем (`design/scrollAnchor.svelte.ts`), явная подгрузка истории под
  высоту окна и прочитанное — когда чат на экране и человек внизу.

  `role="log"` для скринридера — с `aria-live="off"`: иначе он зачитал бы каждую страницу
  подгруженной истории. Новые входящие объявляет отдельная вежливая область.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import { onMount, tick } from 'svelte';
  import EmptyState from '../../design/EmptyState.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import { ScrollAnchor } from '../../design/scrollAnchor.svelte.ts';
  import { dayLabel } from '../../design/time';
  import type { TimelineStore } from '../../core/timeline/timelineStore.svelte.ts';
  import { arrivedFromOthers, UNREAD_DIVIDER_KEY } from '../../core/timeline/layout';
  import type { Message } from '../../core/timeline/message';
  import { isSelectable } from '../../core/timeline/selection';
  import { firstLineOf } from '../../core/timeline/words';
  import { attachmentLabel } from './text';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { i18n, plural, t } from '../../i18n/index.svelte.ts';
  import { Photo, pixelsFor } from '../rooms/faces.svelte.ts';
  import type { MessageActions } from './actions';
  import MessageRow from './MessageRow.svelte';
  import { rovingFocus } from './rovingFocus';
  import { viewport } from '../../design/viewport.svelte.ts';
  import UploadRow from '../media/UploadRow.svelte';

  interface Props {
    store: TimelineStore;
    session: UserSession;
    showSenders: boolean;
    actions: MessageActions;
    /** Режим выбора: ключи отмеченных. `null` — обычная лента. */
    selection?: ReadonlySet<string> | null;
    ontoggle?: (message: Message) => void;
    /** `false` — подглядывание из списка: лента не отмечает прочитанным ничего, сколько ни смотри. */
    reads?: boolean;
    /** Открыть на этом сообщении, а не внизу, — так открывает найденное поиск. */
    openAt?: string;
  }
  let { store, session, showSenders, actions, selection = null, ontoggle, reads = true, openAt }: Props = $props();

  /** Имя строки-галочки: содержимое под ней `inert` и скринридеру не видно. */
  function spoken(message: Message): string {
    const kind = message.kind;
    const words = 'body' in kind ? firstLineOf(kind.body, 'html' in kind ? kind.html : undefined) : attachmentLabel(kind);
    return `${message.own ? t('message.spoken.you') : message.senderName}: ${words}`;
  }

  /** Меню сообщения с клавиатуры — под пузырём, как от «ещё». У удалённого — только когда что было. */
  function menuByKey(key: string, stop: HTMLElement) {
    const item = store.items.find((entry) => entry.key === key);
    if (!item || item.kind !== 'message') return;
    const message = item.message;
    if (!message.eventId || message.kind.type === 'service') return;
    const rect = stop.getBoundingClientRect();
    actions.openMenu(message, { x: rect.left, y: rect.bottom }, !viewport.finePointer);
  }

  function toggleByKey(event: KeyboardEvent, message: Message) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    ontoggle?.(message);
  }

  let container: HTMLElement | undefined = $state();
  let content: HTMLElement | undefined = $state();
  let anchor: ScrollAnchor | undefined = $state();
  let announcement = $state('');
  let now = $state(Date.now());

  // ————— Плавающая дата — `FloatingDate` нативной (Telegram) —————
  // Пока ленту листают, над ней — день того, что сейчас наверху: даты быстрой прокрутки
  // проносятся быстрее, чем их прочтёшь. Остановились — гаснет: читающему она уже не нужна.
  // Только когда листает человек — колесом, пальцем, клавишами, ползунком: лента, вставшая на
  // место сама (открытие, подгрузка истории), датой не мигает.

  const FLOATING_HOLD_MS = 700;
  let floating = $state<string | null>(null);
  let floatingShown = $state(false);
  let handledAt = Number.NEGATIVE_INFINITY;
  let floatTimer: ReturnType<typeof setTimeout> | undefined;
  let floatFrame = 0;
  const byHand = () => (handledAt = performance.now());

  function onscroll() {
    if (performance.now() - handledAt > 1000 || floatFrame) return;
    floatFrame = requestAnimationFrame(() => {
      floatFrame = 0;
      const ts = topmostTs();
      if (ts === undefined) return;
      floating = dayLabel(ts, now, i18n.locale, t('room.today'), t('room.yesterday'));
      floatingShown = true;
      clearTimeout(floatTimer);
      floatTimer = setTimeout(() => (floatingShown = false), FLOATING_HOLD_MS);
    });
  }

  /** Время сообщения, что сейчас у верхнего края ленты. */
  function topmostTs(): number | undefined {
    if (!container || !content) return undefined;
    const top = container.getBoundingClientRect().top;
    for (const row of content.querySelectorAll<HTMLElement>('[data-anchor]')) {
      if (row.getBoundingClientRect().bottom <= top) continue;
      const item = store.items.find((entry) => entry.key === row.dataset['anchor']);
      if (item?.kind === 'message') return item.message.ts;
    }
    return undefined;
  }
  // Слушаем, а не обрабатываем: это не нажатия, а признак того, что прокрутку ведёт человек.
  $effect(() => {
    const target = container;
    if (!target) return;
    const kinds = ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const;
    for (const kind of kinds) target.addEventListener(kind, byHand, { passive: true });
    return () => {
      for (const kind of kinds) target.removeEventListener(kind, byHand);
      clearTimeout(floatTimer);
      cancelAnimationFrame(floatFrame);
    };
  });

  /** Theme.Size.paginationReach и newestReach. */
  const TOP_REACH = 400;
  const BOTTOM_REACH = 80;

  /** Открытие закончилось: история под окно набрана, лента встала, где ей стоять. */
  let opened: Promise<void> = Promise.resolve();

  onMount(() => {
    const a = new ScrollAnchor(container!, content!, {
      topReach: TOP_REACH,
      bottomReach: BOTTOM_REACH,
      onNearTop: () => void store.loadMore(),
    });
    anchor = a;
    // Открытие: история просится явно, пока содержимого меньше, чем окно. Есть полоса
    // «Непрочитанные» — чат открывается на ней, как в Telegram: новое под ней, а не последнее
    // внизу и всё остальное выше, читать в обратную сторону. Всё новое влезает в экран —
    // лента и так стоит у конца.
    opened = store.fill(() => a.needsMore()).then(async () => {
      await tick();
      const divider = content?.querySelector<HTMLElement>(`[data-anchor="${UNREAD_DIVIDER_KEY}"]`);
      if (divider && content && content.scrollHeight > container!.clientHeight) a.reveal(divider, 'top');
    });
    if (openAt) void reveal(openAt);
    // Окно выросло после открытия — развернули на весь экран — подгрузка продолжается.
    const grow = new ResizeObserver(() => {
      if (a.needsMore()) void store.fill(() => a.needsMore());
    });
    grow.observe(container!);
    const minutes = setInterval(() => (now = Date.now()), 60_000);
    return () => {
      grow.disconnect();
      a.destroy();
      clearInterval(minutes);
    };
  });

  /**
   * Пришедшие снизу, пока лента открыта, — поднимаются и проявляются (`Theme.Timing.arrival`).
   * Подгруженная сверху история — нет: она была всегда, просто её не было видно. Обычный
   * `Set`, а не реактивный: класс строке ставится один раз, когда она появляется.
   */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const arrived = new Set<string>();
  let newestKey: string | undefined;
  $effect.pre(() => {
    const messages = store.messages;
    if (newestKey) {
      const from = messages.findIndex((m) => m.key === newestKey) + 1;
      if (from > 0) for (const m of messages.slice(from)) arrived.add(m.key);
    }
    newestKey = messages.at(-1)?.key;
  });

  // Лента поменяется (подгрузка, новое сообщение) — якорь снимается до перемены DOM.
  $effect.pre(() => {
    void store.items;
    void store.uploads;
    anchor?.capture();
  });

  // Прочитано: чат на экране, окно в фокусе, человек внизу.
  function maybeMarkRead() {
    if (reads && anchor?.atBottom && document.visibilityState === 'visible' && document.hasFocus()) store.markRead();
  }
  $effect(() => {
    void store.messages;
    void anchor?.atBottom;
    maybeMarkRead();
  });

  /**
   * Сколько чужих сообщений пришло, пока человек был выше по ленте, — число на кнопке «вниз».
   * Лента его не тащит вниз (он читает), значит, должна сказать. Внизу — обнуляется.
   */
  let unseenBelow = $state(0);
  let lastSeenKey: string | undefined;
  $effect(() => {
    const messages = store.messages;
    const atBottom = anchor?.atBottom ?? true;
    if (atBottom) {
      unseenBelow = 0;
    } else {
      unseenBelow += arrivedFromOthers(messages, lastSeenKey);
    }
    lastSeenKey = messages.at(-1)?.key;
  });

  // Объявить новое входящее — только то, что пришло снизу, а не подгруженную историю.
  let lastKey: string | undefined;
  $effect(() => {
    const last = store.messages.at(-1);
    if (last && lastKey && last.key !== lastKey && !last.own && last.kind.type === 'text') {
      announcement = t('room.announce', { name: last.senderName, text: last.kind.body });
    }
    lastKey = last?.key;
  });

  /**
   * К сообщению — для полосы закреплённого. Нет среди загруженного — лента листает назад
   * (не бесконечно), потом прокрутка в середину экрана и короткая подсветка.
   */
  export async function reveal(eventId: string): Promise<void> {
    // Из поиска — сразу после открытия: иначе открытие поставило бы ленту вниз уже после.
    await opened;
    if (!(await store.reveal(eventId))) return;
    // Фото внутри альбома своей строки не имеет — строка альбома та, что у первого.
    const key = store.items.find(
      (item) => item.kind === 'message' && (item.message.album ?? [item.message]).some((m) => m.eventId === eventId),
    )?.key;
    if (!key) return;
    // Лента пересобирается раз в кадр — строки может ещё не быть в DOM. Подождать несколько.
    let element: HTMLElement | null = null;
    for (let frame = 0; frame < 10 && !element; frame++) {
      await tick();
      element = content?.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(key)}"]`) ?? null;
      if (!element) await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (!element) return;
    if (anchor) anchor.reveal(element);
    else element.scrollIntoView({ block: 'center' });
    element.classList.add('flash');
    setTimeout(() => element.classList.remove('flash'), 1600);
  }

  /** Страница — чуть меньше экрана: последняя строка прошлой остаётся видна. */
  export function page(direction: -1 | 1): void {
    if (!container) return;
    container.scrollBy({ top: direction * container.clientHeight * 0.85 });
  }

  /** `Esc` в чате: вниз, к последнему, — и прочитано. */
  export function toBottom(): void {
    anchor?.scrollToBottom();
    maybeMarkRead();
  }

  // Кэш фото отправителей на время жизни ленты; реактивен сам `Photo`, а не словарь.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const faces = new Map<string, Photo>();
  function photoOf(userId: string, mxc: string | undefined): string | undefined {
    if (!mxc) return undefined;
    const key = `${userId}|${mxc}`;
    let photo = faces.get(key);
    if (!photo) {
      photo = new Photo(session, mxc, pixelsFor(1.75));
      faces.set(key, photo);
    }
    return photo.url;
  }
</script>

<svelte:window onfocus={maybeMarkRead} />
<svelte:document onvisibilitychange={maybeMarkRead} />

<div class="timeline">
{#if floating}
  <p class="day floating" class:shown={floatingShown} aria-hidden="true"><span>{floating}</span></p>
{/if}
<div class="scroller" bind:this={container} {onscroll}>
  <div class="content" bind:this={content} role="log" aria-live="off" aria-label={t('room.timeline')} use:rovingFocus={{ onmenu: menuByKey }}>
    {#if store.loadFailed}
      <div class="problem">
        <EmptyState title={t('room.loadFailedTitle')} message={t('room.loadFailedMessage')} />
        <PrimaryButton onclick={() => void store.retryOpen(() => anchor?.needsMore() ?? true)}>{t('room.tryAgain')}</PrimaryButton>
      </div>
    {:else if store.atStart && store.messages.every((m) => m.kind.type === 'service')}
      <EmptyState title={t('room.emptyTitle')} message={t('room.emptyMessage')} />
    {/if}
    {#each store.items as item (item.key)}
      <!-- Якорь — только сообщения. Разделитель дня — нет: подгруженная история того же дня
           встаёт под него, и он остаётся на месте, пока всё под ним уезжает. -->
      <!-- Без `content-visibility`: оценочная высота ещё не нарисованных строк у верхнего
           края сдвигала якорь на разницу с настоящей — ровно тот прыжок, который мы ловим. -->
      <div class="item" class:arrived={arrived.has(item.key)} data-anchor={item.kind === 'day' ? undefined : item.key}>
        {#if item.kind === 'day'}
          <p class="day"><span>{dayLabel(item.ts, now, i18n.locale, t('room.today'), t('room.yesterday'))}</span></p>
        {:else if item.kind === 'unread'}
          <!-- Полоса во всю ширину, а не слово посередине: это не дата, а «начните здесь». -->
          <h2 class="unread">{t('room.unreadMessages')}</h2>
        {:else if selection && isSelectable(item.message)}
          {@const on = selection.has(item.message.key)}
          <!-- Пока выбирают, нажатие на сообщение ставит галочку и больше ничего: строка под ней
               нарисована как всегда, но нажатий не принимает — ни меню, ни фото, ни ссылок. -->
          <div
            class="selectable"
            role="checkbox"
            data-row-stop
            aria-checked={on}
            aria-label={spoken(item.message)}
            tabindex="-1"
            onclick={() => ontoggle?.(item.message)}
            onkeydown={(event) => toggleByKey(event, item.message)}
          >
            <span class="mark" class:on aria-hidden="true">
              {#if on}<svg viewBox={ICON_VIEWBOX}><path d={icons.check} /></svg>{/if}
            </span>
            <div class="chosen-row" inert>
              <MessageRow
                message={item.message}
                firstInRun={item.firstInRun}
                lastInRun={item.lastInRun}
                {showSenders}
                senderPhoto={showSenders ? photoOf(item.message.senderId, item.message.senderAvatarUrl) : undefined}
                {actions}
                media={session.media}
              />
            </div>
          </div>
        {:else}
          <MessageRow
            message={item.message}
            firstInRun={item.firstInRun}
            lastInRun={item.lastInRun}
            {showSenders}
            senderPhoto={showSenders ? photoOf(item.message.senderId, item.message.senderAvatarUrl) : undefined}
            {actions}
            media={session.media}
          />
        {/if}
      </div>
    {/each}
    {#each store.uploads as upload (upload.id)}
      <div class="item">
        <UploadRow {upload} onretry={() => store.retryUpload(upload.id)} oncancel={() => store.cancelUpload(upload.id)} />
      </div>
    {/each}
  </div>
</div>

{#if store.loadingMore}
  <!-- Плашкой поверх, а не строкой в ленте: строка сверху сдвинула бы то, что читают. -->
  <p class="loading" role="status">{t('room.loadingHistory')}</p>
{/if}

{#if anchor && !anchor.atBottom}
  <button
    type="button"
    class="to-bottom"
    aria-label={unseenBelow > 0 ? `${t('room.scrollToBottom')}, ${plural('roomList.unread', unseenBelow)}` : t('room.scrollToBottom')}
    title={t('room.scrollToBottom')}
    onclick={() => anchor?.scrollToBottom()}
  >
    <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.down} /></svg>
    {#if unseenBelow > 0}<span class="unseen" aria-hidden="true">{new Intl.NumberFormat(i18n.locale).format(unseenBelow)}</span>{/if}
  </button>
{/if}
</div>

<p class="visually-hidden" aria-live="polite">{announcement}</p>

<style>
  .timeline {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .scroller {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    /* Панель по наведению у широкого пузыря выходит за край колонки — горизонтальной
       прокрутки ленте от этого не положено. */
    overflow-x: hidden;
    overscroll-behavior: contain;
  }
  .content {
    display: flex;
    flex-direction: column;
    max-width: var(--column-timeline-max);
    min-height: 100%;
    margin-inline: auto;
    padding: var(--space-normal) var(--timeline-gutter);
    justify-content: flex-end;
  }
  .item:global(.flash) {
    border-radius: var(--radius-bubble);
    animation: flash 1.6s ease-out;
  }
  @keyframes flash {
    from {
      background: var(--color-selected);
    }
    to {
      background: transparent;
    }
  }
  .day {
    display: flex;
    justify-content: center;
    margin: var(--space-roomy) 0 var(--space-tight);
  }
  .day span {
    padding: var(--space-tight) var(--space-normal);
    border-radius: var(--radius-circle);
    background: var(--color-incoming-bubble);
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
  /* Поверх ленты, под шапкой; не ловит нажатий — под ней сообщения. */
  .floating {
    position: absolute;
    inset-inline: 0;
    top: var(--space-close);
    z-index: 1;
    margin: 0;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--timing-menu-close) var(--ease-out);
  }
  .floating.shown {
    opacity: 1;
    transition-duration: var(--timing-chrome);
  }
  .selectable {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    border-radius: var(--radius-control);
    cursor: pointer;
  }
  .selectable:focus-visible {
    outline: var(--border-thick) solid var(--accent);
  }
  .chosen-row {
    flex: 1;
    min-width: 0;
  }
  .mark {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--size-icon);
    height: var(--size-icon);
    border: var(--border-thick) solid var(--color-text-secondary);
    border-radius: var(--radius-circle);
  }
  .mark.on {
    border-color: var(--accent);
    background: var(--accent);
  }
  .mark svg {
    width: 100%;
    height: 100%;
    fill: var(--on-accent);
  }
  .item.arrived {
    animation: arrive var(--timing-arrival) var(--ease-out);
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(var(--motion-rise));
    }
  }
  .unread {
    /* До краёв ленты, за поля, которые держат пузыри: полоса, остановившаяся там же, где они,
       была бы ещё одной фигурой в их столбце. */
    margin: var(--space-roomy) calc(-1 * var(--timeline-gutter)) var(--space-close);
    padding: var(--space-tight) 0;
    background: var(--color-incoming-bubble);
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    font-weight: 500;
    text-align: center;
  }
  .loading {
    position: absolute;
    inset-block-start: var(--space-close);
    inset-inline: 0;
    width: fit-content;
    margin: 0 auto;
    padding: var(--space-tight) var(--space-normal);
    border-radius: var(--radius-circle);
    background: var(--color-glass-opaque);
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
    pointer-events: none;
  }
  .problem {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-normal);
    margin: auto;
  }
  .to-bottom {
    position: absolute;
    inset-inline-end: var(--space-roomy);
    inset-block-end: var(--space-normal);
    display: grid;
    place-items: center;
    width: var(--size-navigation-bar);
    height: var(--size-navigation-bar);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-circle);
    background: var(--color-glass-opaque);
    color: var(--accent);
    cursor: pointer;
  }
  .to-bottom {
    transition:
      opacity var(--timing-chrome) var(--ease-out),
      transform var(--timing-chrome) var(--ease-out);
  }
  @starting-style {
    .to-bottom {
      opacity: 0;
      transform: scale(var(--motion-menu-scale-from));
    }
    .unseen {
      transform: scale(0);
    }
  }
  .unseen {
    transition: transform var(--timing-reaction) var(--ease-menu-open);
    position: absolute;
    inset-block-start: calc(-1 * var(--size-unread-badge) / 2);
    min-width: var(--size-unread-badge);
    height: var(--size-unread-badge);
    padding: 0 var(--space-tight);
    border-radius: var(--radius-circle);
    background: var(--accent);
    color: var(--on-accent);
    font-size: var(--font-size-caption);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: var(--size-unread-badge);
  }
  .to-bottom svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
</style>
