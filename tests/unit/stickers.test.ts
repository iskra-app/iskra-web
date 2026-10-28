import { afterEach, describe, expect, it } from 'vitest';
import { ClientEvent, createClient, SyncState, type MatrixClient } from 'matrix-js-sdk';
import { DemoHomeserver } from '../../src/core/demo/server';
import { demoRooms, demoUsers } from '../../src/core/demo/fixtures';
import { quietLogger } from '../../src/core/support/logger';
import {
  adding,
  isStickerImage,
  packFrom,
  pushing,
  recentIn,
  removing,
  shortcodeFor,
  stickerContent,
  stickerOf,
  stickersIn,
  subscribing,
  subscriptionsIn,
  unsubscribing,
  type Sticker,
} from '../../src/core/stickers/imagePack';
import { StickerLibrary } from '../../src/core/stickers/stickerLibrary.svelte.ts';
import { stripWebPMetadata } from '../../src/core/media/webpMetadata';

const sticker = (url: string, body = '🙂'): Sticker => ({ url, shortcode: '', body });

describe('наборы MSC2545', () => {
  it('стикеры: `usage` картинки важнее набора, только mxc, по имени', () => {
    const content = {
      pack: { usage: ['emoticon'] },
      images: {
        zeta: { url: 'mxc://s/z', usage: ['sticker'] },
        alpha: { url: 'mxc://s/a', usage: ['sticker'], body: 'Привет', info: { w: 512.0, h: 512, mimetype: 'image/png' } },
        emoji: { url: 'mxc://s/e' },
        http: { url: 'https://s/h', usage: ['sticker'] },
      },
    };
    const found = stickersIn(content);
    expect(found.map((s) => s.shortcode)).toEqual(['alpha', 'zeta']);
    expect(found[0]).toEqual({ url: 'mxc://s/a', shortcode: 'alpha', body: 'Привет', width: 512, height: 512, mimetype: 'image/png' });
    // Без `body` — имя.
    expect(found[1]!.body).toBe('zeta');
    // Набор, не сказавший ничего, годится и в стикеры.
    expect(stickersIn({ images: { a: { url: 'mxc://s/a' } } })).toHaveLength(1);
  });

  it('набор: имя и картинка вкладки — своя или первый стикер', () => {
    const pack = packFrom({ pack: { display_name: 'Искра', avatar_url: 'mxc://s/icon' }, images: { a: { url: 'mxc://s/a' } } }, { kind: 'room', roomId: '!r', stateKey: '' });
    expect(pack).toMatchObject({ id: '!r/', name: 'Искра', icon: { url: 'mxc://s/icon' } });
    expect(packFrom({ images: { a: { url: 'mxc://s/a' } } }, { kind: 'mine' }).icon?.url).toBe('mxc://s/a');
  });

  it('добавить и убрать — бережно: чужие поля и эмодзи остаются', () => {
    const own = { 'x.custom': 1, images: { wave: { url: 'mxc://s/w', usage: ['emoticon'] } } };
    const added = adding({ ...sticker('mxc://s/new', '🎉'), width: 10, height: 20 }, own);
    expect(added['x.custom']).toBe(1);
    expect(added['images']).toMatchObject({ wave: { url: 'mxc://s/w' }, sticker: { url: 'mxc://s/new', usage: ['sticker'], body: '🎉', info: { w: 10, h: 20 } } });
    // Второй раз — не дублируется.
    expect(adding(sticker('mxc://s/new'), added)).toBe(added);
    const removed = removing('mxc://s/new', added);
    expect(Object.keys(removed['images'] as object)).toEqual(['wave']);
  });

  it('короткое имя: без пробелов и двоеточий, эмодзи — «sticker», занятое — с номером', () => {
    expect(shortcodeFor('Кот LOL', new Set())).toBe('кот_lol');
    expect(shortcodeFor('a:b', new Set())).toBe('ab');
    expect(shortcodeFor('🎉', new Set(['sticker', 'sticker_2']))).toBe('sticker_3');
  });

  it('подписки: добавить, убрать, пустая комната уходит', () => {
    const one = subscribing('!r', '', {});
    expect(subscriptionsIn(one)).toEqual([{ roomId: '!r', stateKey: '' }]);
    const two = subscribing('!r', 'cats', one);
    expect(subscriptionsIn(two)).toHaveLength(2);
    expect(unsubscribing('!r', 'cats', two)).toEqual(one);
    expect(unsubscribing('!r', '', one)).toEqual({ rooms: {} });
  });

  it('недавние — свежий первым, без повторов, не больше 16', () => {
    let recent: Sticker[] = [];
    for (let i = 0; i < 20; i++) recent = pushing(sticker(`mxc://s/${i}`), recent);
    recent = pushing(sticker('mxc://s/5'), recent);
    expect(recent).toHaveLength(16);
    expect(recent[0]!.url).toBe('mxc://s/5');
    expect(recent.filter((s) => s.url === 'mxc://s/5')).toHaveLength(1);
    expect(recentIn({ images: [{ url: 'mxc://s/1', body: '1' }, { url: 'bad' }] })).toHaveLength(1);
  });

  it('событие `m.sticker` — с `info` всегда и с ответом', () => {
    expect(stickerContent(sticker('mxc://s/a', '👋'), '$e')).toEqual({ body: '👋', url: 'mxc://s/a', info: {}, 'm.relates_to': { 'm.in_reply_to': { event_id: '$e' } } });
  });

  it('стикер ли картинка: WebP или `sticker.<ext>`; в набор — только открытая', () => {
    expect(isStickerImage('image/webp', 'photo.webp')).toBe(true);
    expect(isStickerImage('image/png', 'sticker.png')).toBe(true);
    expect(isStickerImage('image/png', 'cat.png')).toBe(false);
    expect(stickerOf({ name: '👋', source: { mxc: 'mxc://s/a' } })).toMatchObject({ url: 'mxc://s/a', body: '👋' });
    expect(stickerOf({ name: 'sticker.png', source: { mxc: 'mxc://s/a', encryption: {} as never } })).toBeUndefined();
  });

  it('WebP без метаданных: EXIF уходит, флаг в VP8X гаснет, картинка цела', () => {
    const chunk = (name: string, data: number[]) => {
      const length = data.length;
      return [...name].map((c) => c.charCodeAt(0)).concat([length & 0xff, 0, 0, 0], data, length & 1 ? [0] : []);
    };
    const body = [...chunk('VP8X', [0x0c | 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ...chunk('EXIF', [1, 2, 3]), ...chunk('VP8L', [9, 9])];
    const riff = [...'RIFF'].map((c) => c.charCodeAt(0)).concat([(body.length + 4) & 0xff, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0)), body);
    const out = stripWebPMetadata(new Uint8Array(riff))!;
    const text = String.fromCharCode(...out);
    expect(text).not.toContain('EXIF');
    expect(text).toContain('VP8L');
    expect(out[20]).toBe(0x10);
    expect(new DataView(out.buffer).getUint32(4, true)).toBe(out.length - 8);
    expect(stripWebPMetadata(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});

let client: MatrixClient | undefined;
let library: StickerLibrary | undefined;
afterEach(() => {
  library?.destroy();
  client?.stopClient();
  client = library = undefined;
});

async function started() {
  const server = new DemoHomeserver();
  client = createClient({
    baseUrl: server.baseUrl,
    fetchFn: server.fetch,
    logger: quietLogger(),
    userId: demoUsers.alice,
    deviceId: 'DEMODEVICE',
    accessToken: 'demo-token-DEMODEVICE',
  });
  const prepared = new Promise<void>((resolve) => client!.on(ClientEvent.Sync, (s) => s === SyncState.Prepared && resolve()));
  await client.startClient({ initialSyncLimit: 5 });
  await prepared;
  let uploads = 0;
  library = new StickerLibrary(client, async () => `mxc://demo.iskra.invalid/art-${++uploads}`);
  return { client, server, library, uploads: () => uploads };
}

async function until(condition: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

const all = { builtIn: true, roomPack: true, mine: true };
const art = ['hello', 'joy'].map((code) => ({ code, emoji: '👋', load: async () => new Blob([new Uint8Array([1])], { type: 'image/png' }) }));

describe('стикеры аккаунта на демо-сервере', () => {
  it('свой набор, набор чата, «Искорки» — загружаются раз на аккаунт', async () => {
    const { library, server, uploads } = await started();
    await library.load(demoRooms.weekend, all, art);
    expect(library.packs.map((p) => p.origin.kind)).toEqual(['mine', 'room', 'builtIn']);
    expect(library.packs[0]!.stickers.map((s) => s.shortcode)).toEqual(['hello', 'joy', 'love', 'sleepy']);
    expect(library.packs[1]).toMatchObject({ name: 'Искра' });
    expect(library.packs[2]!.stickers.map((s) => s.shortcode)).toEqual(['hello', 'joy']);
    expect(uploads()).toBe(2);
    // Где легли — в данных аккаунта: второй раз не грузим.
    await until(() => !!client!.getAccountData('moscow.swag.iskra.builtin_stickers' as never));
    const again = new StickerLibrary(client!, async () => 'mxc://never');
    await again.load(null, all, art);
    expect(again.packs.find((p) => p.origin.kind === 'builtIn')?.stickers).toHaveLength(2);
    again.destroy();
    expect(uploads()).toBe(2);
    expect(server.unknown).toEqual([]);
  });

  it('осиротевшая запись «Искорок» (убранный из набора стикер) — не в панели и не пропадает при дозаписи', async () => {
    const { library, client } = await started();
    await library.load(null, all, art);
    await until(() => !!client.getAccountData('moscow.swag.iskra.builtin_stickers' as never));
    const stored = client.getAccountData('moscow.swag.iskra.builtin_stickers' as never)!.getContent() as { images: Record<string, unknown> };
    const orphan = { url: 'mxc://demo.iskra.invalid/art-old', body: '🏃', usage: ['sticker'], info: { w: 512, h: 512, mimetype: 'image/png', size: 1 } };
    await client.setAccountData('moscow.swag.iskra.builtin_stickers' as never, { ...stored, images: { ...stored.images, bypass: orphan } } as never);
    await until(() => 'bypass' in ((client.getAccountData('moscow.swag.iskra.builtin_stickers' as never)!.getContent() as { images: object }).images));

    // Другое устройство, в наборе приложения появилась ещё одна картинка: дозапись идёт поверх прежней.
    const more = [...art, { code: 'love', emoji: '❤️', load: art[0]!.load }];
    const again = new StickerLibrary(client, async () => 'mxc://demo.iskra.invalid/art-new');
    await again.load(null, all, more);
    expect(again.packs.find((p) => p.origin.kind === 'builtIn')!.stickers.map((s) => s.shortcode)).toEqual(['hello', 'joy', 'love']);
    await until(() => 'love' in ((client.getAccountData('moscow.swag.iskra.builtin_stickers' as never)!.getContent() as { images: object }).images));
    const written = client.getAccountData('moscow.swag.iskra.builtin_stickers' as never)!.getContent() as { images: Record<string, unknown> };
    expect(Object.keys(written.images).sort()).toEqual(['bypass', 'hello', 'joy', 'love']);
    again.destroy();
  });

  it('выключенные в настройках — не в панели; свой набор всё равно известен', async () => {
    const { library } = await started();
    await library.load(demoRooms.weekend, { builtIn: false, roomPack: false, mine: false }, art);
    expect(library.packs).toEqual([]);
    expect(library.isMine('mxc://demo.iskra.invalid/sticker-hello')).toBe(true);
  });

  it('добавить два подряд — оба остаются; убрать; подписаться и отписаться', async () => {
    const { library } = await started();
    await library.load(demoRooms.weekend, all);
    const room = library.packs.find((p) => p.origin.kind === 'room')!;
    await library.add(room.stickers[0]!);
    await library.add(room.stickers[1]!);
    expect(library.mine!.stickers).toHaveLength(6);
    await until(() => (client!.getAccountData('im.ponies.user_emotes' as never)?.getContent() as { images: object }).images && Object.keys((client!.getAccountData('im.ponies.user_emotes' as never)!.getContent() as { images: object }).images).length === 6);
    await library.remove(room.stickers[0]!);
    expect(library.mine!.stickers).toHaveLength(5);
    expect(library.failure).toBeNull();

    await library.subscribe(room);
    expect(library.isSubscribed(room)).toBe(true);
    await until(() => !!client!.getAccountData('im.ponies.emote_rooms' as never));
    await library.unsubscribe(room);
    expect(library.isSubscribed(room)).toBe(false);
  });

  it('недавние — в данных аккаунта; очистить', async () => {
    const { library } = await started();
    await library.load(null, all);
    library.used(library.mine!.stickers[0]!);
    expect(library.recent).toHaveLength(1);
    await until(() => !!client!.getAccountData('moscow.swag.iskra.recent_stickers' as never));
    await library.clearRecent();
    expect(library.recent).toEqual([]);
  });
});
