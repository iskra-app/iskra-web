import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverServer } from '../../src/core/auth/server';
import { signInWithPassword } from '../../src/core/auth/signIn';
import { demoServer } from '../../src/core/demo/instance';
import { AppState } from '../../src/core/session/app.svelte.ts';
import { vault } from '../../src/core/storage/vault';

// Постоянное хранилище браузера после входа — не то, что здесь проверяется, а без окна его не спросить.
vi.mock('../../src/core/storage/persistence', () => ({
  currentEnvironment: () => ({}),
  isPersisted: async () => true,
  persistenceAdvice: () => 'none',
  requestPersistence: async () => true,
}));

let app: AppState | undefined;
afterEach(async () => {
  if (app?.phase.name === 'signed-in') app.phase.session.stop();
  app = undefined;
  await vault.destroy();
});

async function waitFor(condition: () => boolean, ms = 15_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('мягкий выход, от начала до конца', () => {
  it('сервер просит войти снова → экран входа с этим человеком → вход тем же устройством, без шага восстановления', async () => {
    app = new AppState();
    const server = await discoverServer('demo.iskra.invalid');
    await app.signIn(await signInWithPassword(server, 'alice', 'password'));
    expect(app.phase).toMatchObject({ name: 'signed-in' });
    const session = app.phase.name === 'signed-in' ? app.phase.session : undefined;
    await waitFor(() => !!session?.ready);
    const deviceId = (await vault.current())!.deviceId;

    demoServer().askToSignInAgain();
    session!.retry();
    await waitFor(() => app!.phase.name === 'signed-out');
    const phase = app.phase;
    expect(phase).toMatchObject({ name: 'signed-out', ended: true, resume: { deviceId } });

    // Перезагрузка страницы — тот же экран, сеанс не поднимается с мёртвым токеном.
    const reloaded = new AppState();
    await reloaded.boot(null);
    expect(reloaded.phase).toMatchObject({ name: 'signed-out', resume: { deviceId } });

    await app.signIn(await signInWithPassword(server, 'alice', 'password', deviceId));
    expect(app.phase.name).toBe('signed-in');
    expect(app.recoveryStep).toBe(false);
    expect((await vault.current())?.deviceId).toBe(deviceId);
    const resumed = app.phase.name === 'signed-in' ? app.phase.session : undefined;
    await waitFor(() => !!resumed?.ready);
    // Плашка «старая переписка» спрашивает сервер сама; дождаться, чтобы остановка её не оборвала.
    await resumed?.recovery?.refresh();
  }, 40_000);
});
