// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
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
});
