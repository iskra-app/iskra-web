import { flip } from 'svelte/animate';

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

/** `Theme.Timing.reactionPops`: `.spring(duration: 0.4, bounce: 0.3)`, со временем на затухание. */
const REACTION_POP = 480;
const REACTION_PERIOD = 0.4;
const REACTION_DAMPING = 0.7;
function reactionSpring(t: number): number {
  const omega = (2 * Math.PI) / REACTION_PERIOD;
  const damped = omega * Math.sqrt(1 - REACTION_DAMPING ** 2);
  const decay = REACTION_DAMPING * omega;
  const time = (t * REACTION_POP) / 1000;
  return 1 - Math.exp(-decay * time) * (Math.cos(damped * time) + (decay / damped) * Math.sin(damped * time));
}

/** Из ничего, а не на месте: реакция — маленькое событие, и в ленте ей одной можно подпрыгнуть. */
const REACTION_SCALE_FROM = 0.01;
export function reactionPops(_node: Element): Motion {
  return {
    duration: reducedMotion() ? 0 : REACTION_POP,
    easing: reactionSpring,
    css: (t) => `transform: scale(${REACTION_SCALE_FROM + (1 - REACTION_SCALE_FROM) * t})`,
  };
}

/** Снятая — быстрее, чем пришла, и без отскока; прозрачность прячет последнюю крошку стекла. */
export function reactionLeaves(_node: Element): Motion {
  return {
    duration: reducedMotion() ? 0 : 160,
    easing: (t) => t * t,
    css: (t) => `transform: scale(${REACTION_SCALE_FROM + (1 - REACTION_SCALE_FROM) * t}); opacity: ${t}`,
  };
}

/** Соседи уступают место той же пружиной. */
export function reactionSlides(node: Element, rects: { from: DOMRect; to: DOMRect }) {
  return flip(node, rects, { duration: reducedMotion() ? 0 : REACTION_POP, easing: reactionSpring });
}
