import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverServer } from '../../src/core/auth/server';
import { signInWithPassword } from '../../src/core/auth/signIn';
import { demoServer } from '../../src/core/demo/instance';
import { OAuth2, TokenRefresher, TokenRefreshLogoutError } from 'matrix-js-sdk';
import { OAuth2HTTPError } from 'matrix-js-sdk/lib/oauth/error';
import { refusalsOnly, UserSession } from '../../src/core/session/userSession.svelte.ts';
import { vault } from '../../src/core/storage/vault';

let session: UserSession | undefined;
afterEach(async () => {
  session?.stop();
  session = undefined;
  await vault.destroy();
});

const noop = { onTokensRefreshed: async () => {}, onLoggedOut: () => {} };

async function databases(): Promise<string[]> {
  return (await indexedDB.databases()).map((d) => d.name ?? '');
}

async function waitFor(condition: () => boolean, ms = 10_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('сессия против демо-сервера', () => {
  it('вход паролем → сессия с Rust-крипто → выход стирает все базы пользователя', async () => {
    const server = await discoverServer('demo.iskra.invalid');
    const fresh = await signInWithPassword(server, 'alice', 'password');
    expect(fresh.method).toBe('demo');

    const { account, secrets } = await vault.add(fresh);
    session = await UserSession.start(account, secrets, noop);
    await waitFor(() => session!.ready);
    expect(session.connection).toBe('online');

    const mine = (await databases()).filter((n) => n.includes(account.userId));
    expect(mine.some((n) => n.includes('matrix-sdk-crypto'))).toBe(true);
    expect(mine.some((n) => n.includes('iskra-sync'))).toBe(true);

    await session.signOut();
    expect((await databases()).filter((n) => n.includes(account.userId))).toEqual([]);
    expect(demoServer().unknown).toEqual([]);
  }, 30_000);
});

describe('сервер просит войти снова', () => {
  it('мягкий выход ничего не стирает; вход тем же устройством — те же базы и ключи', async () => {
    const server = await discoverServer('demo.iskra.invalid');
    const fresh = await signInWithPassword(server, 'alice', 'password');
    const { account, secrets } = await vault.add(fresh);
    let soft: boolean | undefined;
    session = await UserSession.start(account, secrets, { ...noop, onLoggedOut: (value) => (soft = value) });
    await waitFor(() => session!.ready);

    demoServer().askToSignInAgain();
    session.retry();
    await waitFor(() => soft !== undefined);
    expect(soft).toBe(true);
    session.stop();
    await vault.markSignedOutSoftly(account.userId);
    const mine = (await databases()).filter((n) => n.includes(account.userId));
    expect(mine.some((n) => n.includes('matrix-sdk-crypto'))).toBe(true);
    expect((await vault.current())?.signedOutSoftly).toBe(true);

    // Вход снова — с тем же устройством: сервер его продолжает, запись — та же, ключ хранилища — тот же.
    const again = await signInWithPassword(server, 'alice', 'password', account.deviceId);
    expect(again.deviceId).toBe(account.deviceId);
    const resumed = await vault.resume(again);
    expect(resumed?.secrets.cryptoStorageKey).toBe(secrets.cryptoStorageKey);
    expect(resumed?.account.signedOutSoftly).toBeUndefined();
    session = await UserSession.start(resumed!.account, resumed!.secrets, noop);
    await waitFor(() => session!.ready);
    expect(session.connection).toBe('online');
    expect(demoServer().unknown).toEqual([]);
  }, 30_000);

  it('другое устройство — не продолжение', async () => {
    const server = await discoverServer('demo.iskra.invalid');
    const { account } = await vault.add(await signInWithPassword(server, 'alice', 'password'));
    await vault.markSignedOutSoftly(account.userId);
    expect(await vault.resume(await signInWithPassword(server, 'alice', 'password'))).toBeUndefined();
  });
});

describe('обновление токена', () => {
  const refresherFailingWith = (status: number) => {
    const oauth = {
      performRefreshTokenGrant: async () => {
        throw new OAuth2HTTPError('refresh failed', status, undefined, { error: status === 400 ? 'invalid_grant' : 'slow_down' });
      },
    } as unknown as OAuth2;
    return new TokenRefresher(refusalsOnly(oauth), async () => {}).tokenRefreshFunction;
  };

  it('«слишком часто» и таймаут — не выход: SDK повторит позже, ничего не стирая', async () => {
    for (const status of [408, 429, 403]) {
      const error = await refresherFailingWith(status)('refresh').catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(TokenRefreshLogoutError);
    }
  });

  it('отказ по RFC 6749 (400, 401) — выход, как и было', async () => {
    for (const status of [400, 401]) {
      await expect(refresherFailingWith(status)('refresh')).rejects.toBeInstanceOf(TokenRefreshLogoutError);
    }
  });
});
