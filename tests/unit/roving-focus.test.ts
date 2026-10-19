// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rovingFocus } from '../../src/features/room/rovingFocus';

function timeline(count: number) {
  const log = document.createElement('div');
  log.setAttribute('role', 'log');
  for (let i = 0; i < count; i++) {
    log.insertAdjacentHTML(
      'beforeend',
      `<div data-anchor="m${i}"><div role="article" data-row-stop>Сообщение ${i} <a href="https://example.org/${i}">ссылка</a></div><button type="button">ещё</button></div>`,
    );
  }
  log.insertAdjacentHTML('beforeend', '<button type="button" class="outside">Повторить</button>');
  document.body.append(log);
  return log;
}

const stopsOf = (log: HTMLElement) => [...log.querySelectorAll<HTMLElement>('[data-row-stop]')];
const press = (target: HTMLElement, key: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));

describe('лента с клавиатуры', () => {
  afterEach(() => document.body.replaceChildren());

  it('в порядке Tab — одно сообщение, последнее; кнопки и ссылки — только у него', () => {
    const log = timeline(3);
    rovingFocus(log, { onmenu: vi.fn() });
    expect(stopsOf(log).map((s) => s.tabIndex)).toEqual([-1, -1, 0]);
    const linkOf = (i: number) => log.querySelector<HTMLElement>(`[data-anchor="m${i}"] a`)!;
    expect(linkOf(0).getAttribute('tabindex')).toBe('-1');
    expect(linkOf(2).hasAttribute('tabindex')).toBe(false);
    // Вне строк — не трогаем.
    expect(log.querySelector('.outside')!.hasAttribute('tabindex')).toBe(false);
  });

  it('↑/↓, Home/End — по сообщениям; ссылки едут за текущим и возвращаются как были', () => {
    const log = timeline(3);
    rovingFocus(log, { onmenu: vi.fn() });
    const stops = stopsOf(log);
    stops[2]!.focus();
    press(stops[2]!, 'ArrowUp');
    expect(document.activeElement).toBe(stops[1]);
    expect(stops.map((s) => s.tabIndex)).toEqual([-1, 0, -1]);
    expect(log.querySelector('[data-anchor="m1"] a')!.hasAttribute('tabindex')).toBe(false);
    expect(log.querySelector('[data-anchor="m2"] a')!.getAttribute('tabindex')).toBe('-1');
    press(stops[1]!, 'Home');
    expect(document.activeElement).toBe(stops[0]);
    press(stops[0]!, 'ArrowUp');
    expect(document.activeElement).toBe(stops[0]);
    press(stops[0]!, 'End');
    expect(document.activeElement).toBe(stops[2]);
  });

  it('Enter, Shift F10 и клавиша меню — меню этого сообщения; со ссылки — нет', () => {
    const log = timeline(2);
    const onmenu = vi.fn();
    rovingFocus(log, { onmenu });
    const stops = stopsOf(log);
    press(stops[0]!, 'Enter');
    press(stops[0]!, 'F10', { shiftKey: true });
    press(stops[1]!, 'ContextMenu');
    expect(onmenu.mock.calls.map(([key]) => key)).toEqual(['m0', 'm0', 'm1']);
    press(log.querySelector<HTMLElement>('[data-anchor="m1"] a')!, 'Enter');
    expect(onmenu).toHaveBeenCalledTimes(3);
  });

  it('фокус щелчком делает строку текущей', () => {
    const log = timeline(3);
    rovingFocus(log, { onmenu: vi.fn() });
    log.querySelector<HTMLElement>('[data-anchor="m0"] button')!.focus();
    expect(stopsOf(log).map((s) => s.tabIndex)).toEqual([0, -1, -1]);
  });
});
