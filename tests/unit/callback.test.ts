import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAuthCallback } from '../../src/core/auth/callback';
import { SignInError } from '../../src/core/auth/server';
import { completeSignIn } from '../../src/core/auth/signIn';

describe('возврат со страницы входа', () => {
  it('OAuth во фрагменте — код забран, адрес чист', () => {
    const r = parseAuthCallback('https://web.iskra.test/#code=secret-code&state=abc');
    expect(r.callback).toEqual({ kind: 'oauth', code: 'secret-code', state: 'abc' });
    expect(r.cleanUrl).toBe('https://web.iskra.test/');
    expect(r.cleanUrl).not.toContain('secret');
  });

  it('OAuth в query тоже', () => {
    const r = parseAuthCallback('https://web.iskra.test/?state=abc&code=c2');
    expect(r.callback).toEqual({ kind: 'oauth', code: 'c2', state: 'abc' });
    expect(r.cleanUrl).toBe('https://web.iskra.test/');
  });

  it('отказ на стороне сервера — это возврат, а не «ничего не было»', () => {
    const r = parseAuthCallback('https://web.iskra.test/#error=access_denied&state=abc');
    expect(r.callback).toEqual({ kind: 'oauth-error', error: 'access_denied', state: 'abc' });
    expect(r.cleanUrl).toBe('https://web.iskra.test/');
  });

  it('legacy SSO', () => {
    const r = parseAuthCallback('https://web.iskra.test/?loginToken=tok#/');
    expect(r.callback).toEqual({ kind: 'sso', loginToken: 'tok' });
    expect(r.cleanUrl).toBe('https://web.iskra.test/');
  });

  it('обычный адрес чата не трогается', () => {
    const href = 'https://web.iskra.test/#/room/!abc%3Amatrix.org';
    expect(parseAuthCallback(href)).toEqual({ callback: null, cleanUrl: href });
  });
});

describe('ожидание входа', () => {
  const storage = new Map<string, string>();
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('возврат с чужим state ожидание не забирает — начатый вход не обрывается', async () => {
    storage.set('iskra.signIn.pending', JSON.stringify({ kind: 'oauth', state: 'mine', baseUrl: 'https://example.org' }));
    await expect(completeSignIn({ kind: 'oauth', code: 'x', state: 'theirs' })).rejects.toBeInstanceOf(SignInError);
    await expect(completeSignIn({ kind: 'oauth-error', error: 'access_denied', state: null })).rejects.toBeInstanceOf(SignInError);
    expect(storage.has('iskra.signIn.pending')).toBe(true);
  });

  it('свой отказ — забирает', async () => {
    storage.set('iskra.signIn.pending', JSON.stringify({ kind: 'oauth', state: 'mine', baseUrl: 'https://example.org' }));
    await expect(completeSignIn({ kind: 'oauth-error', error: 'access_denied', state: 'mine' })).rejects.toBeInstanceOf(SignInError);
    expect(storage.has('iskra.signIn.pending')).toBe(false);
  });
});
