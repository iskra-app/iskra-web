/**
 * Смена экрана на телефоне — пуш, как в навигации iOS: чат въезжает справа поверх списка, назад
 * — уезжает вправо (`::view-transition-*` в `base.css`). Только на стеке: на двух и трёх
 * колонках список и чат стоят рядом, и сдвигать всё окно ради смены чата было бы неправдой.
 *
 * View Transitions — там, где браузер их знает; где нет и где просили меньше движения, экран
 * просто меняется, как раньше.
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

/** Глубина экрана: список — ноль, чат и настройки — над ним. */
const depth = (route: Route): number => (route.name === 'home' ? 0 : 1);

export function installScreenMotion(): () => void {
  router.transition = (apply, from, to) => {
    const start = (document as Document & { startViewTransition?: (update: () => void) => ViewTransitionLike }).startViewTransition;
    if (!start || viewport.layout !== 'stack' || reducedMotion() || depth(from) === depth(to)) {
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
  };
}
