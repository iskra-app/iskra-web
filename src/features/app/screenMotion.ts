/**
 * Смена экрана на телефоне — пуш, как в навигации iOS: чат въезжает справа поверх списка, назад
 * — уезжает вправо (`::view-transition-*` в `base.css`). Только на стеке: на двух и трёх
 * колонках список и чат стоят рядом, и сдвигать всё окно ради смены чата было бы неправдой.
 *
 * View Transitions — там, где браузер их знает; где нет и где просили меньше движения, экран
 * просто меняется, как раньше.
 *
 * Свайп от края в Safari на iPhone — «назад» самого браузера, со своей анимацией: страница уже
 * уехала под пальцем. Наша поверх неё показала бы то же второй раз. Браузер говорит об этом
 * `hasUAVisualTransition`; где не говорит (iOS до 18), узнаём шаг по истории, начатый касанием
 * у края экрана.
 */
import { flushSync } from 'svelte';
import type { Route } from '../../core/navigation/route';
import { router } from '../../core/navigation/router.svelte.ts';
import { reducedMotion } from '../../design/motion';
import { viewport } from '../../design/viewport.svelte.ts';

/** Что возвращает `startViewTransition` — только то, что здесь нужно. */
interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
}

/** Глубина экрана: список — ноль, чат и настройки — над ним. Чужая ссылка — вопрос над списком. */
const depth = (route: Route): number => (route.name === 'home' || route.name === 'open' ? 0 : 1);

/** Ширина полосы у края, откуда Safari начинает свайп «назад» и «вперёд», px. */
const EDGE_PX = 24;
/** Сколько после касания у края шаг по истории ещё считается свайпом, мс: жест длится, пока палец ведёт. */
const EDGE_SWIPE_MS = 1500;

export function installScreenMotion(): () => void {
  let edgeTouch = -Infinity;
  const ontouchstart = (event: TouchEvent) => {
    const x = event.touches[0]?.clientX;
    if (x !== undefined && (x <= EDGE_PX || x >= window.innerWidth - EDGE_PX)) edgeTouch = event.timeStamp;
  };
  document.addEventListener('touchstart', ontouchstart, { passive: true, capture: true });

  router.transition = (apply, from, to, how) => {
    const start = (document as Document & { startViewTransition?: (update: () => void) => ViewTransitionLike }).startViewTransition;
    const swiped = how.browserAnimated || (how.traversal && performance.now() - edgeTouch < EDGE_SWIPE_MS);
    if (!start || swiped || viewport.layout !== 'stack' || reducedMotion() || depth(from) === depth(to)) {
      apply();
      return;
    }
    document.documentElement.dataset['nav'] = depth(to) > depth(from) ? 'forward' : 'back';
    // Снимок «до» уже сделан; новое состояние должно лечь в DOM внутри колбэка — сразу.
    const transition = start.call(document, () => flushSync(apply));
    // Прерванный переход (окно сменило размер, вкладку спрятали) — не ошибка: экран всё равно
    // сменился, просто без движения. Его обещания отклоняются — ловим, чтобы не сыпать в консоль.
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
  };
  return () => {
    router.transition = null;
    document.removeEventListener('touchstart', ontouchstart, { capture: true });
  };
}
