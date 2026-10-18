import { formatRoute, parseRoute, type Route } from './route';

/**
 * Своя маршрутизация на History API — без библиотечного роутера.
 *
 * Стек того, что открыто поверх (листы, просмотрщик, меню), живёт здесь же на
 * следующих этапах: на Android системная «назад» закрывает последнее открытое,
 * на десктопе то же делает `Esc`.
 */
class Router {
  route = $state<Route>({ name: 'home' });
  /**
   * Как показать смену маршрута — анимацией экрана, например (`features/app/screenMotion.ts`).
   * Ядро не знает, какой ширины окно и как оно движется: только даёт сменить маршрут внутри.
   */
  transition: ((apply: () => void, from: Route, to: Route) => void) | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    this.route = parseRoute(window.location.hash);
    window.addEventListener('hashchange', () => {
      const from = this.route;
      const to = parseRoute(window.location.hash);
      const apply = () => (this.route = to);
      if (this.transition) this.transition(apply, from, to);
      else apply();
    });
  }

  go(route: Route): void {
    const hash = formatRoute(route);
    if (window.location.hash === hash) return;
    window.location.hash = hash;
  }
}

export const router = new Router();
