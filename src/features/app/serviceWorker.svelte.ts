/**
 * Регистрация service worker'а и «Доступна новая версия».
 *
 * Своя, а не `virtual:pwa-register`: под Trusted Types адрес скрипта SW — это
 * `TrustedScriptURL`, и строкой его не передать. Политика `iskra-sw` пропускает ровно
 * один адрес — наш `sw.js` — и больше ничего.
 *
 * Новая версия ждёт: `skipWaiting` — по нажатию «Обновить» или сам, когда вкладка ушла в
 * фон (человек отвернулся, набор сообщения не прерывается; черновики лежат в хранилище).
 * Новую версию ищем, не дожидаясь перезагрузки: при возвращении на вкладку и раз в час.
 */
import { Workbox } from 'workbox-window';

/** Скрипт и область SW — от базового пути сборки: в подпапке, например `/iskra-web/`. */
const SCOPE = import.meta.env.BASE_URL;
const SW_URL = `${SCOPE}sw.js`;

function scriptUrl(): string | TrustedScriptURL {
  const factory = window.trustedTypes;
  if (!factory) return SW_URL;
  const policy = factory.createPolicy('iskra-sw', {
    createScriptURL: (url) => {
      if (url !== SW_URL) throw new TypeError('Only the Iskra service worker may be registered');
      return url;
    },
  });
  return policy.createScriptURL(SW_URL);
}

/** Не чаще одного запроса к серверу за раз в это время — и раз в столько же, пока вкладка открыта. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

class AppUpdate {
  available = $state(false);
  private workbox: Workbox | undefined;
  private applying = false;
  private checkedAt = Date.now();

  register(): void {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || this.workbox) return;
    this.workbox = new Workbox(scriptUrl() as string, { scope: SCOPE });
    this.workbox.addEventListener('waiting', () => {
      this.available = true;
      this.applyIfHidden();
    });
    // Без service worker'а приложение работает, просто без офлайна. Ничего не логируем.
    this.workbox.register().catch(() => {});

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.applyIfHidden();
      else this.check();
    });
    setInterval(() => this.check(), CHECK_EVERY_MS);
  }

  apply(): void {
    const workbox = this.workbox;
    if (!workbox || this.applying) return;
    this.applying = true;
    workbox.addEventListener('controlling', () => window.location.reload());
    workbox.messageSkipWaiting();
  }

  /** Вкладка не на виду — обновляем без спроса: человек этого не заметит. */
  private applyIfHidden(): void {
    if (this.available && document.visibilityState === 'hidden') this.apply();
  }

  /** Спрашивает сервер, нет ли нового `sw.js`. Найдётся — придёт `waiting`, как обычно. */
  private check(): void {
    if (Date.now() - this.checkedAt < CHECK_EVERY_MS / 6) return;
    this.checkedAt = Date.now();
    this.workbox?.update().catch(() => {});
  }
}

export const appUpdate = new AppUpdate();
