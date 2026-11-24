import { formatRoute, parseRoute, type Route } from './route';

/**
 * Чужая ссылка, открытая до входа. Вход через сервер (OAuth, SSO) уводит со страницы и
 * возвращает на корень — без адреса; ссылка ждёт в `sessionStorage` вкладки, пока не отработает.
 */
const PENDING_OPEN = 'iskra.open.pending';
const OVERLAY_ENTRY = 'iskraOverlay';
const PREVIOUS_ENTRY = 'iskraPrevious';

function rememberOpen(hash: string | null): void {
  try {
    if (hash) sessionStorage.setItem(PENDING_OPEN, hash);
    else sessionStorage.removeItem(PENDING_OPEN);
  } catch {
    // Хранилище закрыто — ссылка просто не переживёт уход на страницу входа.
  }
}

function pendingOpen(): string | null {
  try {
    const hash = sessionStorage.getItem(PENDING_OPEN);
    return hash && parseRoute(hash).name === 'open' ? hash : null;
  } catch {
    return null;
  }
}

/** Как сменился маршрут — чтобы не анимировать то, что браузер уже показал сам. */
export interface Navigation {
  /** Шаг по истории, а не переход по ссылке или `go`. */
  traversal: boolean;
  /**
   * Браузер уже нарисовал смену страницы сам — свайп «назад» в Safari на iPhone
   * (`PopStateEvent.hasUAVisualTransition`). Своя анимация поверх неё — вторая.
   */
  browserAnimated: boolean;
}

/**
 * Своя маршрутизация на History API — без библиотечного роутера.
 *
 * На сенсорном экране над маршрутом может быть ещё один шаг истории для верхнего слоя.
 * Оболочка решает, какой слой закрыть, а адрес чата остаётся тем же.
 */
class Router {
  route = $state<Route>({ name: 'home' });
  /**
   * Как показать смену маршрута — анимацией экрана, например (`features/app/screenMotion.ts`).
   * Ядро не знает, какой ширины окно и как оно движется: только даёт сменить маршрут внутри.
   */
  transition: ((apply: () => void, from: Route, to: Route, how: Navigation) => void) | null = null;
  onOverlayBack: (() => void) | null = null;
  private overlay: { hash: string; closing: boolean } | null = null;
  private afterOverlay: (() => void) | null = null;

  /**
   * Последний `popstate` — шаг по истории («назад», «вперёд», свайп). Приходит раньше
   * `hashchange` того же шага; тот его и забирает.
   */
  private traversal: (Navigation & { hash: string }) | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    this.route = parseRoute(window.location.hash);
    if (this.route.name === 'open') rememberOpen(window.location.hash);
    else if (!window.location.hash.replace(/^#\/?/, '')) {
      // Вернулись со страницы входа — на корень, без адреса: ссылка, с которой пришли, ждёт тут.
      const pending = pendingOpen();
      if (pending) {
        window.history.replaceState(window.history.state, '', pending);
        this.route = parseRoute(pending);
      }
    }
    // Установленное приложение: ссылка на него фокусирует уже открытое окно (`launch_handler:
    // focus-existing` в манифесте), а адрес отдаёт сюда, не меняя страницы. Не прочитать — и
    // окно просто всплывёт там, где было. Запуск из дока — адрес без маршрута: где был, там и стоим.
    const launchQueue = (window as Window & { launchQueue?: { setConsumer: (consumer: (params: { targetURL?: string }) => void) => void } }).launchQueue;
    launchQueue?.setConsumer(({ targetURL }) => {
      if (!targetURL) return;
      const route = parseRoute(new URL(targetURL).hash);
      if (route.name === 'open' || route.name === 'room') this.go(route);
    });
    window.addEventListener('popstate', (event: PopStateEvent & { hasUAVisualTransition?: boolean }) => {
      const hash = window.location.hash;
      const overlay = this.overlay;
      this.overlay = null;
      if (overlay?.hash === hash && !event.state?.[OVERLAY_ENTRY]) {
        if (!overlay.closing) this.onOverlayBack?.();
        const after = this.afterOverlay;
        this.afterOverlay = null;
        after?.();
        return;
      }
      this.afterOverlay = null;
      // Шаг без смены адреса `hashchange` не даст — запомненное узнаётся по адресу.
      this.traversal = { traversal: true, browserAnimated: event.hasUAVisualTransition === true, hash };
    });
    window.addEventListener('hashchange', () => {
      const step = this.traversal?.hash === window.location.hash ? this.traversal : null;
      this.traversal = null;
      this.navigate(window.location.hash, { traversal: !!step, browserAnimated: step?.browserAnimated ?? false });
    });
  }

  go(route: Route): void {
    const hash = formatRoute(route);
    if (window.location.hash === hash) return;
    if (this.overlay?.closing) {
      this.afterOverlay = () => this.go(route);
      return;
    }
    const state = { [PREVIOUS_ENTRY]: window.location.hash };
    if (this.overlay) window.history.replaceState(state, '', hash);
    else window.history.pushState(state, '', hash);
    this.overlay = null;
    this.navigate(hash);
  }

  /** Назад внутри приложения. У прямой ссылки может не быть предыдущего экрана приложения. */
  backTo(route: Route): void {
    if (this.overlay?.closing) {
      this.afterOverlay = () => this.backTo(route);
      return;
    }
    if (!this.overlay && window.history.state?.[PREVIOUS_ENTRY] === formatRoute(route)) window.history.back();
    else this.go(route);
  }

  showOverlay(): void {
    if (this.overlay) return;
    const hash = window.location.hash;
    window.history.pushState({ [OVERLAY_ENTRY]: true }, '');
    this.overlay = { hash, closing: false };
  }

  dismissOverlay(): void {
    if (!this.overlay || this.overlay.closing) return;
    this.overlay.closing = true;
    window.history.back();
  }

  /**
   * Сменить маршрут, не оставляя прежний в истории: `#/open/…` отработал — «назад» не должен
   * возвращать к нему и спрашивать снова.
   */
  replace(route: Route): void {
    const hash = formatRoute(route);
    if (window.location.hash === hash) return;
    if (this.overlay) {
      this.afterOverlay = () => this.replace(route);
      this.dismissOverlay();
      return;
    }
    window.history.replaceState(window.history.state, '', hash);
    this.navigate(hash);
  }

  private navigate(hash: string, how: Navigation = { traversal: false, browserAnimated: false }): void {
    const from = this.route;
    const to = parseRoute(hash);
    if (to.name === 'open') rememberOpen(hash);
    else if (from.name === 'open') rememberOpen(null);
    const apply = () => {
      // Колбэк снимка может прийти после следующего клика или шага истории.
      if (window.location.hash === hash) this.route = to;
    };
    if (this.transition) this.transition(apply, from, to, how);
    else apply();
  }
}

export const router = new Router();
