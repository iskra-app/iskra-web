/**
 * Лента с клавиатуры — одна остановка Tab на всю ленту (`role="log"`), как список чатов.
 *
 * В порядке табуляции — одно сообщение, «текущее»: сначала последнее, потом то, где человек
 * был. `↑`/`↓` — соседнее, `Home`/`End` — первое и последнее из загруженных; `Enter`,
 * `Shift F10` и клавиша меню — меню сообщения со всеми действиями. Ссылки, «Слушать»,
 * реакции и «ещё» внутри — в порядке Tab только у текущего: Tab с сообщения ведёт в его
 * кнопки, а не в кнопки сотни других. Иначе до поля ввода — несколько сотен нажатий.
 *
 * Строка — `[data-anchor]` ленты; остановка в ней — пузырь (`role="article"`), а пока выбирают
 * несколько — галочка строки; обе помечены `data-row-stop`. Строки пересобираются Svelte'ом, поэтому
 * текущее помнится ключом строки, а не элементом, и раскладка повторяется после каждой
 * перемены в ленте.
 */

const ROW = '[data-anchor]';
/** Остановка строки помечена `data-row-stop`: пузырь — всегда, галочка — пока выбирают. */
const STOP = '[data-row-stop]:not([inert] *)';
const FOCUSABLE = 'a[href], button, input, select, textarea, audio[controls], video[controls], [tabindex]';
/** Исходный `tabindex` того, что мы вынули из порядка Tab, — вернуть, когда строка станет текущей. */
const SAVED = 'data-roving-tabindex';

export interface RovingOptions {
  /** Меню сообщения строки с этим ключом — `Enter`, `Shift F10`, клавиша меню. */
  onmenu: (key: string, stop: HTMLElement) => void;
}

export function rovingFocus(log: HTMLElement, options: RovingOptions) {
  let current = options;
  /** Ключ текущей строки. `null` — последняя. */
  let activeKey: string | null = null;
  let scheduled = 0;

  const stops = () => [...log.querySelectorAll<HTMLElement>(STOP)].filter((stop) => stop.closest(ROW));
  const keyOf = (element: Element) => element.closest<HTMLElement>(ROW)?.dataset['anchor'] ?? null;

  function activeStop(list = stops()): HTMLElement | undefined {
    return (activeKey !== null ? list.find((stop) => keyOf(stop) === activeKey) : undefined) ?? list[list.length - 1];
  }

  function apply() {
    scheduled = 0;
    const list = stops();
    const active = activeStop(list);
    const activeRow = active?.closest(ROW) ?? null;
    for (const stop of list) stop.tabIndex = stop === active ? 0 : -1;
    for (const element of log.querySelectorAll<HTMLElement>(FOCUSABLE)) {
      const row = element.closest(ROW);
      if (!row || list.includes(element)) continue;
      if (row === activeRow) {
        if (element.hasAttribute(SAVED)) {
          const saved = element.getAttribute(SAVED)!;
          element.removeAttribute(SAVED);
          if (saved === '') element.removeAttribute('tabindex');
          else element.setAttribute('tabindex', saved);
        }
      } else if (!element.hasAttribute(SAVED) && element.getAttribute('tabindex') !== '-1') {
        element.setAttribute(SAVED, element.getAttribute('tabindex') ?? '');
        element.setAttribute('tabindex', '-1');
      }
    }
  }

  function schedule() {
    if (!scheduled) scheduled = requestAnimationFrame(apply);
  }

  function move(to: HTMLElement | undefined) {
    if (!to) return;
    activeKey = keyOf(to);
    apply();
    to.focus();
  }

  function onkeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    // Только когда фокус на самой строке: у опроса и плеера внутри — свои стрелки.
    if (!target.matches(STOP) || event.altKey || event.ctrlKey || event.metaKey) return;
    const list = stops();
    const at = list.indexOf(target);
    if (at < 0) return;
    const key = event.key;
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End') {
      if (event.shiftKey) return;
      event.preventDefault();
      move(key === 'ArrowUp' ? list[at - 1] : key === 'ArrowDown' ? list[at + 1] : key === 'Home' ? list[0] : list[list.length - 1]);
      return;
    }
    const menu = (key === 'Enter' && !event.shiftKey) || key === 'ContextMenu' || (key === 'F10' && event.shiftKey);
    if (menu && target.getAttribute('role') === 'article') {
      const rowKey = keyOf(target);
      if (!rowKey) return;
      event.preventDefault();
      current.onmenu(rowKey, target);
    }
  }

  /** Куда бы ни пришёл фокус — щелчком, Tab'ом, из меню — его строка становится текущей. */
  function onfocusin(event: FocusEvent) {
    const key = keyOf(event.target as Element);
    if (key === null || key === activeKey) return;
    activeKey = key;
    apply();
  }

  const observer = new MutationObserver(schedule);
  observer.observe(log, { childList: true, subtree: true });
  log.addEventListener('keydown', onkeydown);
  log.addEventListener('focusin', onfocusin);
  apply();

  return {
    update(next: RovingOptions) {
      current = next;
    },
    destroy() {
      cancelAnimationFrame(scheduled);
      observer.disconnect();
      log.removeEventListener('keydown', onkeydown);
      log.removeEventListener('focusin', onfocusin);
    },
  };
}
