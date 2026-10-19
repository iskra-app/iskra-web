/**
 * Движение, которое не умеет CSS сам. Всё остальное — в `base.css` и токенах (`--timing-*`).
 */

/** Человек попросил меньше движения — появляться сразу. */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Позвать `done`, когда закрытое окно догорело (см. `dialog[data-motion]` в `base.css`): до
 * тех пор его содержимое должно оставаться, иначе уезжает пустая рамка. Не дождались
 * `transitionend` (браузер переходов не знает, окно скрыли иначе) — по часам, с запасом.
 */
export function whenClosed(dialog: HTMLDialogElement, done: () => void): () => void {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    dialog.removeEventListener('transitionend', onEnd);
    clearTimeout(timer);
    done();
  };
  const onEnd = (event: TransitionEvent) => {
    if (event.target === dialog && (event.propertyName === 'opacity' || event.propertyName === 'transform')) finish();
  };
  dialog.addEventListener('transitionend', onEnd);
  const timer = setTimeout(finish, reducedMotion() ? 0 : 500);
  return () => {
    finished = true;
    dialog.removeEventListener('transitionend', onEnd);
    clearTimeout(timer);
  };
}

/** Svelte-переход: что и сколько. Svelte 5 играет его через Web Animations — строгой CSP это можно. */
interface Motion {
  duration: number;
  easing: (t: number) => number;
  css: (t: number, u: number) => string;
}

/** Плавный выход в покой — `--ease-out` для переходов, которые считает Svelte. */
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Лист выезжает с края (справа — в письме слева направо) и уезжает туда же. */
export function slideFromEnd(_node: Element, { duration = 220 }: { duration?: number } = {}): Motion {
  const rtl = typeof document !== 'undefined' && document.dir === 'rtl';
  return {
    duration: reducedMotion() ? 0 : duration,
    easing: easeOut,
    css: (_t, u) => `transform: translateX(${(rtl ? -u : u) * 100}%)`,
  };
}

/** Проявиться и погаснуть — подложка под листом. */
export function fadeInOut(_node: Element, { duration = 150 }: { duration?: number } = {}): Motion {
  return { duration: reducedMotion() ? 0 : duration, easing: easeOut, css: (t) => `opacity: ${t}` };
}
