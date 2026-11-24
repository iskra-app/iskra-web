// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { router, type Navigation } from '../../src/core/navigation/router.svelte.ts';

/** Сменить адрес так, как это делает браузер, — `popstate` (если шаг по истории), потом `hashchange`. */
function step(hash: string, popstate?: { hasUAVisualTransition: boolean }): Promise<Navigation> {
  return new Promise((resolve) => {
    router.transition = (apply, _from, _to, how) => {
      apply();
      router.transition = null;
      resolve(how);
    };
    window.history.replaceState(null, '', hash);
    if (popstate) window.dispatchEvent(Object.assign(new PopStateEvent('popstate'), popstate));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('как сменился маршрут', () => {
  it('переход по ссылке — не шаг по истории', async () => {
    expect(await step('#/settings')).toEqual({ traversal: false, browserAnimated: false });
  });

  it('«назад», который браузер нарисовал сам (свайп в Safari), — так и сказано', async () => {
    expect(await step('#/', { hasUAVisualTransition: true })).toEqual({ traversal: true, browserAnimated: true });
  });

  it('«назад» кнопкой — шаг по истории без анимации браузера', async () => {
    expect(await step('#/settings', { hasUAVisualTransition: false })).toEqual({ traversal: true, browserAnimated: false });
  });

  it('`popstate` от другого адреса не прилипает к следующему переходу', async () => {
    window.history.replaceState(null, '', '#/settings/about');
    window.dispatchEvent(Object.assign(new PopStateEvent('popstate'), { hasUAVisualTransition: true }));
    expect(await step('#/')).toEqual({ traversal: false, browserAnimated: false });
  });

  it('запоздалый снимок экрана не возвращает прежний чат', () => {
    const updates: Array<() => void> = [];
    router.transition = (apply) => { updates.push(apply); };
    try {
      router.go({ name: 'room', roomId: '!first:example.org' });
      router.go({ name: 'room', roomId: '!last:example.org' });
      updates[1]?.();
      updates[0]?.();
      expect(router.route).toEqual({ name: 'room', roomId: '!last:example.org' });
    } finally {
      router.transition = null;
    }
  });

  it('назад с верхнего слоя закрывает только его и сохраняет адрес чата', async () => {
    const close = vi.fn();
    router.onOverlayBack = close;
    const hash = window.location.hash;
    try {
      router.showOverlay();
      const popped = new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
      window.history.back();
      await popped;
      expect(close).toHaveBeenCalledTimes(1);
      expect(window.location.hash).toBe(hash);
    } finally {
      router.onOverlayBack = null;
    }
  });
});
