/**
 * «Искорки» — свои стикеры приложения, десять настроений розовой искры, те же PNG, что в
 * нативной (`StickerArt`): 512 на сторону, прозрачные, без метаданных. Лежат в `public/stickers`
 * и нужны раз на аккаунт — загрузить на сервер (см. `StickerLibrary`).
 */
import { asset } from '../../design/asset';
import type { StickerArt, StickerSources } from '../../core/stickers/stickerLibrary.svelte.ts';
import { preferences } from '../app/preferences.svelte.ts';

const moods: ReadonlyArray<readonly [string, string]> = [
  ['hello', '👋'],
  ['joy', '🎉'],
  ['love', '❤️'],
  ['curious', '🤔'],
  ['surprise', '😮'],
  ['sleepy', '😴'],
  ['sad', '😢'],
  ['grumpy', '😒'],
  ['loading', '⏳'],
  ['unlocked', '🔓'],
];

export const stickerArt: readonly StickerArt[] = moods.map(([code, emoji]) => ({
  code,
  emoji,
  load: async () => {
    const response = await fetch(asset(`stickers/sticker-${code}.png`));
    if (!response.ok) throw new Error(`sticker ${code}: ${response.status}`);
    return response.blob();
  },
}));

/** Что показывать в панели — «Отображение стикеров» в настройках. */
export function stickerSources(): StickerSources {
  return { builtIn: preferences.stickersBuiltIn, roomPack: preferences.stickersRoomPack, mine: preferences.stickersMine };
}

/** Есть ли что показать: всё выключено — и кнопки нет, кнопка к пустой панели ничего не делает. */
export function showsStickers(): boolean {
  return preferences.stickersBuiltIn || preferences.stickersRoomPack || preferences.stickersMine;
}
