import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWasmMimeError, refreshWasm } from '../../src/core/support/wasmCache';

afterEach(() => vi.restoreAllMocks());

describe('isWasmMimeError', () => {
  it('узнаёт сообщение браузера', () => {
    const message = "Failed to execute 'compile' on 'WebAssembly': Incorrect response MIME type. Expected 'application/wasm'.";
    expect(isWasmMimeError(new TypeError(message))).toBe(true);
    expect(isWasmMimeError(message)).toBe(true);
  });

  it('не принимает чужие ошибки', () => {
    expect(isWasmMimeError(new Error('QuotaExceededError'))).toBe(false);
    expect(isWasmMimeError(new Error('Incorrect response MIME type for a font'))).toBe(false);
    expect(isWasmMimeError(undefined)).toBe(false);
  });
});

describe('refreshWasm', () => {
  it('скачивает каждый .wasm заново, мимо кеша, и не трогает остальное', async () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { name: 'https://x.test/assets/a-1.wasm' },
      { name: 'https://x.test/assets/a-1.wasm' },
      { name: 'https://x.test/assets/index.js' },
    ] as PerformanceEntry[]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(''));
    vi.stubGlobal('fetch', fetchMock);
    const deleted: string[] = [];
    const cache = {
      keys: async () => [new Request('https://x.test/assets/a-1.wasm'), new Request('https://x.test/assets/index.js')],
      delete: async (request: Request) => void deleted.push(request.url),
    };
    vi.stubGlobal('caches', { keys: async () => ['precache'], open: async () => cache });

    await refreshWasm();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://x.test/assets/a-1.wasm', { cache: 'reload' });
    expect(deleted).toEqual(['https://x.test/assets/a-1.wasm']);
    vi.unstubAllGlobals();
  });

  it('не падает, если сеть недоступна', async () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ name: 'https://x.test/a.wasm' }] as PerformanceEntry[]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(refreshWasm()).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
