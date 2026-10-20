/**
 * Жизнь приложения от открытия вкладки до выхода — одна машина состояний:
 *
 *   loading → signed-out ⇄ signing-in → signed-in
 *                               ↘ elsewhere (аккаунт открыт в другой вкладке)
 *
 * Порядок при старте:
 * 1. возврат со страницы входа — забран и стёрт из адреса ещё в `main.ts`;
 * 2. аккаунт из хранилища;
 * 3. лок одной вкладки — не получили, клиент не поднимаем;
 * 4. сессия.
 */
import type { AuthCallback } from '../auth/callback';
import { SignInError, type SignInProblem } from '../auth/server';
import { completeSignIn } from '../auth/signIn';
import {
  currentEnvironment,
  isPersisted,
  persistenceAdvice,
  requestPersistence,
  type PersistenceAdvice,
} from '../storage/persistence';
import { vault, type Account, type AccountSecrets, type NewAccount } from '../storage/vault';
import { errorDetail } from '../support/errorDetail';
import { SessionLock } from './lock';
import { wallpaperPhoto } from '../storage/wallpaper';
import { UserSession, wipeUserData } from './userSession.svelte.ts';
import { forgetMovedMarkers } from '../timeline/readMarker';

export type Phase =
  | { name: 'loading' }
  | { name: 'signed-out'; problem?: SignInProblem; detail?: string; ended?: boolean }
  | { name: 'elsewhere'; userId: string }
  | { name: 'signed-in'; session: UserSession };

export interface AppHooks {
  /** Другая вкладка просит показаться: окно может не дать себя сфокусировать — тогда мигнуть. */
  onFocusRequested?: () => void;
}

export class AppState {
  phase = $state<Phase>({ name: 'loading' });
  /** Что сказать про хранилище после входа — см. `persistence.ts`. */
  persistence = $state<PersistenceAdvice>('none');
  /**
   * Шаг между входом и чатами: восстановление переписки. Идёт после каждого *нового* входа
   * (не после перезагрузки страницы — там о запертой переписке напомнит плашка в списке).
   */
  recoveryStep = $state(false);

  private lock: SessionLock | null = null;
  private hooks: AppHooks = {};

  async boot(callback: AuthCallback | null, hooks: AppHooks = {}): Promise<void> {
    this.hooks = hooks;
    if (callback) {
      if (callback.kind === 'oauth-error') {
        // Человек сам отказался или сервер отказал. Код ожидания всё равно забрать.
        await completeSignIn(callback).catch(() => {});
        this.phase = { name: 'signed-out', problem: 'ssoIncomplete' };
        return;
      }
      try {
        await this.finishSignIn(await completeSignIn(callback));
      } catch (error) {
        this.phase = { name: 'signed-out', problem: problemOf(error, 'ssoIncomplete') };
      }
      return;
    }

    let account: Account | undefined;
    try {
      account = await vault.current();
    } catch (error) {
      this.phase = { name: 'signed-out', problem: 'storageUnavailable', detail: errorDetail(error) };
      return;
    }
    if (!account) {
      this.phase = { name: 'signed-out' };
      return;
    }
    await this.open(account);
  }

  /** Вход с паролем или в демо — без редиректа. */
  async signIn(account: NewAccount): Promise<void> {
    await this.finishSignIn(account);
  }

  private async finishSignIn(fresh: NewAccount): Promise<void> {
    this.recoveryStep = true;
    // Демо стирается при каждом новом входе: своя база, ни следа прошлого запуска.
    if (fresh.method === 'demo') await wipeUserData(fresh.userId).catch(() => {});
    let account: Account;
    try {
      ({ account } = await vault.add(fresh));
    } catch (error) {
      throw new SignInError('storageUnavailable', { cause: error });
    }
    await this.open(account);
  }

  private async open(account: Account): Promise<void> {
    this.lock = await SessionLock.acquire(account.userId, this.lockCallbacks());
    if (!this.lock) {
      this.phase = { name: 'elsewhere', userId: account.userId };
      return;
    }
    await this.startSession(account);
  }

  private lockCallbacks() {
    return {
      onFocusRequested: () => this.hooks.onFocusRequested?.(),
      onTakenOver: async () => {
        if (this.phase.name === 'signed-in') {
          const userId = this.phase.session.userId;
          this.phase.session.stop();
          this.phase = { name: 'elsewhere', userId };
        }
        this.lock = null;
      },
    };
  }

  private async startSession(account: Account): Promise<void> {
    let secrets: AccountSecrets | undefined;
    let secretsError: unknown;
    try {
      secrets = await vault.secrets(account.userId);
    } catch (error) {
      secretsError = error;
    }
    if (!secrets) {
      this.releaseLock();
      this.phase = {
        name: 'signed-out',
        problem: 'storageUnavailable',
        ...(secretsError ? { detail: errorDetail(secretsError) } : {}),
      };
      return;
    }
    let session: UserSession | undefined;
    let failure: unknown;
    for (let attempt = 0; attempt < START_ATTEMPTS && !session; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, START_RETRY_DELAY_MS));
      try {
        session = await UserSession.start(account, secrets, {
          onTokensRefreshed: (tokens) => vault.updateTokens(account.userId, tokens),
          onLoggedOut: () => void this.sessionEnded(),
        });
      } catch (error) {
        failure = error;
      }
    }
    if (!session) {
      // Не поднялось криптохранилище или база синхронизации. Аккаунт не трогаем:
      // следующая попытка может пройти, а удалить ключи — необратимо.
      // Загрузку WASM SDK запоминает вместе с неудачей и в этой вкладке не повторит —
      // значит, один раз перезагружаем страницу (не больше: вечного цикла быть не должно).
      if (reloadOnce()) return;
      this.releaseLock();
      this.phase = { name: 'signed-out', problem: 'storageUnavailable', detail: errorDetail(failure) };
      return;
    }
    clearReloadMark();
    this.phase = { name: 'signed-in', session };
    void this.checkPersistence();
    // Где стоит переписка — для плашки «Старая переписка заблокирована». На новом входе
    // шаг восстановления спросит сам.
    if (!this.recoveryStep) void session.recovery?.refresh();
  }

  private async checkPersistence(): Promise<void> {
    const advice = persistenceAdvice(currentEnvironment(await isPersisted()));
    if (advice === 'ask-silently') {
      await requestPersistence();
      this.persistence = 'none';
      return;
    }
    this.persistence = advice;
  }

  /** Firefox: человек прочитал объяснение и нажал «Разрешить». */
  async askPersistence(): Promise<void> {
    await requestPersistence();
    this.persistence = persistenceAdvice(currentEnvironment(await isPersisted()));
  }

  /** Шаг восстановления пройден (или отложен) — дальше чаты. */
  finishRecovery(): void {
    this.recoveryStep = false;
  }

  /** Плашка «Старая переписка заблокирована» — вернуться к шагу восстановления. */
  openRecovery(): void {
    this.recoveryStep = true;
  }

  dismissPersistence(): void {
    this.persistence = 'none';
  }

  /** «Перейти туда». */
  focusOther(): void {
    if (this.phase.name === 'elsewhere') SessionLock.requestFocus(this.phase.userId);
  }

  /** «Открыть здесь»: та вкладка останавливается и показывает тот же экран у себя. */
  async takeOver(): Promise<void> {
    if (this.phase.name !== 'elsewhere') return;
    const userId = this.phase.userId;
    this.phase = { name: 'loading' };
    this.lock = await SessionLock.takeOver(userId, this.lockCallbacks());
    const account = await vault.current();
    if (!account || account.userId !== userId) {
      this.releaseLock();
      this.phase = { name: 'signed-out' };
      return;
    }
    await this.startSession(account);
  }

  async signOut(): Promise<void> {
    if (this.phase.name !== 'signed-in') return;
    const session = this.phase.session;
    this.phase = { name: 'loading' };
    await session.signOut();
    forgetMovedMarkers();
    await vault.remove(session.userId).catch(() => {});
    await wallpaperPhoto.forget();
    this.releaseLock();
    this.phase = { name: 'signed-out' };
  }

  /** Сервер больше не принимает этот сеанс: локально удаляем всё и просим войти снова. */
  private async sessionEnded(): Promise<void> {
    if (this.phase.name !== 'signed-in') return;
    const session = this.phase.session;
    await session.wipe();
    await vault.remove(session.userId).catch(() => {});
    await wallpaperPhoto.forget();
    this.releaseLock();
    this.phase = { name: 'signed-out', ended: true };
  }

  private releaseLock(): void {
    this.lock?.release();
    this.lock = null;
  }
}

/** Сколько раз пробуем поднять сессию, прежде чем сдаться, и пауза между попытками. */
const START_ATTEMPTS = 2;
const START_RETRY_DELAY_MS = 1000;
const RELOAD_MARK = 'iskra-start-reloaded';

/** Перезагружает страницу, если ещё не перезагружали после сбоя. `true` — перезагрузка пошла. */
function reloadOnce(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_MARK)) return false;
    sessionStorage.setItem(RELOAD_MARK, '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

function clearReloadMark(): void {
  try {
    sessionStorage.removeItem(RELOAD_MARK);
  } catch {
    // Нет sessionStorage — метки не было.
  }
}

function problemOf(error: unknown, fallback: SignInProblem): SignInProblem {
  return error instanceof SignInError ? error.problem : fallback;
}

export const app = new AppState();
