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
import { demoAvailable, SignInError, type SignInProblem } from '../auth/server';
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
import { isWasmMimeError, refreshWasm } from '../support/wasmCache';
import { SessionLock } from './lock';
import { wallpaperPhoto } from '../storage/wallpaper';
import { UserSession, wipeUserData } from './userSession.svelte.ts';
import { forgetMovedMarkers } from '../timeline/readMarker';

/**
 * Кто на этом устройстве ждёт, чтобы в него вошли снова после мягкого выхода, — и с каким
 * устройством: вход с ним же оставляет ключи и переписку на месте.
 */
export interface Resume {
  userId: string;
  deviceId: string;
  homeserverUrl: string;
}

export type Phase =
  | { name: 'loading' }
  | { name: 'signed-out'; problem?: SignInProblem; detail?: string; ended?: boolean; resume?: Resume }
  | { name: 'elsewhere'; userId: string }
  | { name: 'signed-in'; session: UserSession };

export interface AppHooks {
  /** Другая вкладка просит показаться: окно может не дать себя сфокусировать — тогда мигнуть. */
  onFocusRequested?: () => void;
  /** Другая вкладка получила чужую ссылку (`#/open/…`), а сессия здесь. */
  onLinkPassed?: (hash: string) => void;
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
    // Демо-вход из сборки, где демо было, а в этой его нет: заходить некуда.
    if (!account || (account.method === 'demo' && !demoAvailable)) {
      this.phase = { name: 'signed-out' };
      return;
    }
    await this.open(account);
  }

  /** Вход с паролем или в демо — без редиректа. */
  async signIn(account: NewAccount): Promise<void> {
    await this.finishSignIn(account);
  }

  /**
   * Сначала лок: открыт этот аккаунт в другой вкладке — её базы и её запись не трогаем.
   *
   * Вход снова в то же устройство после мягкого выхода — продолжение: базы и ключ
   * криптохранилища прежние, восстанавливать переписку не нужно.
   *
   * Иначе это новое устройство: прежние базы этого человека (от прошлого входа, от выхода,
   * который не дочистил) ему не годятся, а с новым ключом криптохранилища и не откроются — и
   * стираются. Аккаунт на устройстве один: кто был здесь до него, уходит со всем своим — иначе
   * после выхода второго в браузере молча открывался бы первый (экран входа об этом
   * предупреждает). Кроме демо: оно на время и чужого не трогает.
   */
  private async finishSignIn(fresh: NewAccount): Promise<void> {
    this.lock = await SessionLock.acquire(fresh.userId, this.lockCallbacks());
    if (!this.lock) {
      this.phase = { name: 'elsewhere', userId: fresh.userId };
      return;
    }
    let account: Account;
    try {
      const resumed = await vault.resume(fresh);
      this.recoveryStep = !resumed;
      if (resumed) {
        ({ account } = resumed);
      } else {
        if (fresh.method !== 'demo') await this.forgetOthers(fresh.userId);
        await wipeUserData(fresh.userId).catch(() => {});
        ({ account } = await vault.add(fresh));
      }
    } catch (error) {
      this.releaseLock();
      throw new SignInError('storageUnavailable', { cause: error });
    }
    await this.startSession(account);
  }

  /** Все прочие аккаунты устройства — кроме открытых в другой вкладке: тот, чей лок занят, жив. */
  private async forgetOthers(userId: string): Promise<void> {
    for (const other of await vault.all()) {
      if (other.userId === userId) continue;
      const lock = await SessionLock.acquire(other.userId);
      if (!lock) continue;
      try {
        await wipeUserData(other.userId).catch(() => {});
        await vault.remove(other.userId).catch(() => {});
      } finally {
        lock.release();
      }
    }
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
      onLinkPassed: (hash: string) => this.hooks.onLinkPassed?.(hash),
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
    if (account.signedOutSoftly) {
      this.releaseLock();
      this.phase = { name: 'signed-out', ended: true, resume: resumeOf(account) };
      return;
    }
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
          onLoggedOut: (soft) => void (soft ? this.sessionPaused(account) : this.sessionEnded()),
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
      // Если причина — испорченный кеш WASM (сервер когда-то отдал его с чужим типом), сперва
      // заменяем запись: иначе перезагрузка возьмёт из кеша то же самое.
      if (isWasmMimeError(failure) && !hasReloaded()) await refreshWasm();
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

  /** Ссылка пришла сюда, а сессия в другой вкладке: пусть откроется там. */
  passLink(hash: string): void {
    if (this.phase.name === 'elsewhere') SessionLock.passLink(this.phase.userId, hash);
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
    // Базы не стёрлись — запись аккаунта всё равно уходит (`forget`), а без её ключа
    // криптохранилище не открыть.
    await session.signOut().catch(() => {});
    await this.forget(session.userId);
    this.phase = { name: 'signed-out' };
  }

  /** Сервер больше не принимает этот сеанс: локально удаляем всё и просим войти снова. */
  private async sessionEnded(): Promise<void> {
    if (this.phase.name !== 'signed-in') return;
    const session = this.phase.session;
    await session.wipe().catch(() => {});
    await this.forget(session.userId);
    this.phase = { name: 'signed-out', ended: true };
  }

  /**
   * Сервер просит войти снова, а устройство оставил: клиент — стоп, ключи и переписка — на
   * месте, запись помечена. Экран входа предложит войти снова тем же человеком и с тем же
   * устройством. Нативная в этом случае не стирает ничего тоже.
   */
  private async sessionPaused(account: Account): Promise<void> {
    if (this.phase.name !== 'signed-in') return;
    this.phase.session.stop();
    await vault.markSignedOutSoftly(account.userId).catch(() => {});
    this.releaseLock();
    this.phase = { name: 'signed-out', ended: true, resume: resumeOf(account) };
  }

  /**
   * Запись аккаунта (токены, ключ криптохранилища, черновики) и прочее своё — даже если
   * базы стереть не вышло: выход, после которого токены остались на диске, а экран завис на
   * загрузке, — худший из исходов на чужом компьютере.
   */
  private async forget(userId: string): Promise<void> {
    forgetMovedMarkers();
    await vault.remove(userId).catch(() => {});
    await wallpaperPhoto.forget().catch(() => {});
    this.releaseLock();
  }

  private releaseLock(): void {
    this.lock?.release();
    this.lock = null;
  }
}

function resumeOf({ userId, deviceId, homeserverUrl }: Account): Resume {
  return { userId, deviceId, homeserverUrl };
}

/** Сколько раз пробуем поднять сессию, прежде чем сдаться, и пауза между попытками. */
const START_ATTEMPTS = 2;
const START_RETRY_DELAY_MS = 1000;
const RELOAD_MARK = 'iskra-start-reloaded';

function hasReloaded(): boolean {
  try {
    return !!sessionStorage.getItem(RELOAD_MARK);
  } catch {
    return true;
  }
}

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
