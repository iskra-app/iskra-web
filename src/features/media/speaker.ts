/**
 * Динамик один — и голосовое играет одно: включили второе — первое встало на паузу. Как
 * `Speaker.claim` нативной Искры: два голоса поверх друг друга — значит, не слушают ни один.
 */
interface Listener {
  pause(): void;
}

let holder: Listener | null = null;

/** Начинаю играть: кто играл — на паузу. */
export function claimSpeaker(listener: Listener): void {
  if (holder && holder !== listener) holder.pause();
  holder = listener;
}

/** Ушёл с экрана — динамик свободен. */
export function releaseSpeaker(listener: Listener): void {
  if (holder === listener) holder = null;
}
