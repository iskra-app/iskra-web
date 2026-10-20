/**
 * Настройки этого устройства — `localStorage`.
 *
 * Только то, что не жалко потерять: акцент, тема, ширина колонок. Хранилище может
 * отсутствовать или бросать (приватное окно, заблокированные данные сайта), и
 * приложение от этого не должно ломаться — только забыть настройку.
 */
import { clampListWidth, LIST_IDEAL } from '../../design/columns';
import { RECENT_LIMIT } from '../room/emojiCatalog';
import { defaultQuickReaction } from '../room/reactions';
import { autoDownloads, compressions, type MediaAutoDownload, type MediaCompression } from '../media/mediaSettings';
import { i18n, locales, preferredLocale, type Locale } from '../../i18n/index.svelte.ts';

export const accents = ['blue', 'red', 'orange', 'yellow', 'green', 'cyan', 'violet', 'mono'] as const;
export type Accent = (typeof accents)[number];
export type Appearance = 'system' | 'light' | 'dark';
/** Лица без фото — `FaceMode` нативной Искры; по умолчанию инициалы, как там (`blobatarByDefault`). */
export const faceModes = ['creatures', 'initials', 'creaturesAlways'] as const;
export type FaceMode = (typeof faceModes)[number];
/** Шрифт: Inter из своих файлов (по умолчанию) или системный. */
export const fonts = ['inter', 'system'] as const;
export type Font = (typeof fonts)[number];

/** Обои — `Wallpaper` нативной Искры: ничего, шесть градиентов, своё фото. Одни на всё приложение. */
export const wallpapers = ['none', 'sunset', 'sea', 'forest', 'dusk', 'sand', 'night', 'photo'] as const;
export type Wallpaper = (typeof wallpapers)[number];
/** Затемнение обоев: до 0.8 — дальше выбор становится чёрным экраном со слухами о картинке. */
export const MAX_DIMMING = 0.8;
/** Четверть: градиенту не нужно, фото обычно нужно, а с нуля своё фото сначала нечитаемо. */
const DEFAULT_DIMMING = 0.25;

/** Как выглядит переписка — `MessageLayout` нативной Искры: пузыри или компактный столбец. */
export const layouts = ['bubbles', 'compact'] as const;
export type MessageLayout = (typeof layouts)[number];

/** Где треды — `ThreadSettings.Shown` нативной: всегда, в больших чатах (по умолчанию), никогда. */
export const threadPlaces = ['always', 'inLargeRooms', 'never'] as const;
export type ThreadPlace = (typeof threadPlaces)[number];

/** Язык: как в браузере или выбранный вручную (план: «с выбором вручную в настройках»). */
export type LanguageChoice = 'system' | Locale;

const keys = {
  accent: 'appearance.accent',
  tintsInterface: 'appearance.tintsInterface',
  appearance: 'appearance.mode',
  listWidth: 'layout.listWidth',
  faces: 'appearance.faces',
  font: 'appearance.font',
  language: 'language',
  recentEmoji: 'reactions.recent',
  quickReaction: 'reactions.quick',
  layout: 'messages.layout',
  wallpaper: 'appearance.wallpaper',
  wallpaperDimming: 'appearance.wallpaperDimming',
  stripMetadata: 'media.stripsMetadata',
  compress: 'media.compresses',
  compression: 'media.compression',
  autoDownload: 'media.autoDownload',
  hideNameChanges: 'chats.hidesNameChanges',
  hideMembershipChanges: 'chats.hidesMembershipChanges',
  sendWithModEnter: 'composer.sendsWithCommandReturn',
  hidePresence: 'privacy.hidesPresence',
  hideTyping: 'privacy.hidesTyping',
  stickersBuiltIn: 'stickers.showsBuiltIn',
  stickersRoomPack: 'stickers.showsRoomPack',
  stickersMine: 'stickers.showsMine',
  threadsShown: 'chats.threads.shown',
  threadsHideReplies: 'chats.threads.hidesReplies',
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Не сохранилось — значит, не запомним. Ломать из-за этого нечего.
  }
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

function dimming(value: string | null): number {
  const n = value === null ? NaN : Number(value);
  return Number.isFinite(n) ? Math.min(MAX_DIMMING, Math.max(0, n)) : DEFAULT_DIMMING;
}

/** Одна эмодзи — не пустая и не абзац; иначе умолчание. */
function emojiOr(value: string | null, fallback: string): string {
  return value && value.length <= 32 && !/\s/.test(value) ? value : fallback;
}

/** Через пробел, как у нативной; мусор и лишнее — отброшены. */
function recentList(value: string | null): string[] {
  return (value ?? '').split(' ').filter((e) => e && e.length <= 32).slice(0, RECENT_LIMIT);
}

class Preferences {
  accent = $state<Accent>(oneOf(read(keys.accent), accents, 'blue'));
  /**
   * «Тонировать интерфейс» — `AccentTheme.tintsInterface` нативной: акцент лёгким листом поверх
   * всего. Выключено по умолчанию: цвет, разлитый везде, ничего не выделяет.
   */
  tintsInterface = $state<boolean>(read(keys.tintsInterface) === 'true');
  appearance = $state<Appearance>(oneOf(read(keys.appearance), ['system', 'light', 'dark'], 'system'));
  listWidth = $state<number>(clampListWidth(Number(read(keys.listWidth) ?? LIST_IDEAL)));
  faces = $state<FaceMode>(oneOf(read(keys.faces), faceModes, 'initials'));
  font = $state<Font>(oneOf(read(keys.font), fonts, 'inter'));
  language = $state<LanguageChoice>(oneOf(read(keys.language), ['system', ...locales], 'system'));
  layout = $state<MessageLayout>(oneOf(read(keys.layout), layouts, 'bubbles'));
  wallpaper = $state<Wallpaper>(oneOf(read(keys.wallpaper), wallpapers, 'none'));
  wallpaperDimming = $state<number>(dimming(read(keys.wallpaperDimming)));
  /** Фото и видео — ключи и умолчания `MediaSettings` нативной: метаданные стираются, сжатие среднее. */
  stripMetadata = $state<boolean>(read(keys.stripMetadata) !== 'false');
  compress = $state<boolean>(read(keys.compress) !== 'false');
  compression = $state<MediaCompression>(oneOf(read(keys.compression), compressions, 'balanced'));
  autoDownload = $state<MediaAutoDownload>(oneOf(read(keys.autoDownload), autoDownloads, 'always'));
  /** «Чаты» — ключи нативной: служебные строки видны, Enter отправляет. */
  hideNameChanges = $state<boolean>(read(keys.hideNameChanges) === 'true');
  hideMembershipChanges = $state<boolean>(read(keys.hideMembershipChanges) === 'true');
  /** Enter переносит строку, отправляет `Ctrl/⌘ Enter` — для тех, кто пишет абзацами. */
  sendWithModEnter = $state<boolean>(read(keys.sendWithModEnter) === 'true');
  /**
   * «Конфиденциальность» — `PrivacySettings` нативной, те же ключи, по умолчанию выключены.
   * Скрыл своё время захода — не видишь и чужого; скрыл «печатает…» — чужое видишь.
   */
  hidePresence = $state<boolean>(read(keys.hidePresence) === 'true');
  hideTyping = $state<boolean>(read(keys.hideTyping) === 'true');
  /** Какие наборы в панели стикеров — `StickerSettings` нативной; все включены, пока не выключили. */
  stickersBuiltIn = $state<boolean>(read(keys.stickersBuiltIn) !== 'false');
  stickersRoomPack = $state<boolean>(read(keys.stickersRoomPack) !== 'false');
  stickersMine = $state<boolean>(read(keys.stickersMine) !== 'false');
  threadsShown = $state<ThreadPlace>(oneOf(read(keys.threadsShown), threadPlaces, 'inLargeRooms'));
  /** Ответы в тредах — только в треде, не в чате. Выключено: ответы видны и там, и там. */
  threadsHideReplies = $state<boolean>(read(keys.threadsHideReplies) === 'true');
  /** Что ставит двойное касание сообщения — любая эмодзи, ключ нативной (`QuickReaction`). */
  quickReaction = $state<string>(emojiOr(read(keys.quickReaction), defaultQuickReaction));
  /** Недавние реакции — наверху панели «Больше эмодзи» (`RecentEmoji` нативной, тот же ключ). */
  recentEmoji = $state.raw<string[]>(recentList(read(keys.recentEmoji)));

  /** Пишет в хранилище и отражает на `<html>` всё, что изменилось. */
  persist(): () => void {
    return $effect.root(() => {
      $effect(() => write(keys.accent, this.accent));
      $effect(() => write(keys.tintsInterface, String(this.tintsInterface)));
      $effect(() => write(keys.appearance, this.appearance));
      $effect(() => write(keys.listWidth, String(this.listWidth)));
      $effect(() => write(keys.faces, this.faces));
      $effect(() => write(keys.font, this.font));
      $effect(() => write(keys.layout, this.layout));
      $effect(() => write(keys.wallpaper, this.wallpaper));
      $effect(() => write(keys.wallpaperDimming, String(this.wallpaperDimming)));
      $effect(() => write(keys.recentEmoji, this.recentEmoji.join(' ')));
      $effect(() => write(keys.quickReaction, this.quickReaction));
      $effect(() => write(keys.stripMetadata, String(this.stripMetadata)));
      $effect(() => write(keys.compress, String(this.compress)));
      $effect(() => write(keys.compression, this.compression));
      $effect(() => write(keys.autoDownload, this.autoDownload));
      $effect(() => write(keys.hideNameChanges, String(this.hideNameChanges)));
      $effect(() => write(keys.hideMembershipChanges, String(this.hideMembershipChanges)));
      $effect(() => write(keys.sendWithModEnter, String(this.sendWithModEnter)));
      $effect(() => write(keys.hidePresence, String(this.hidePresence)));
      $effect(() => write(keys.hideTyping, String(this.hideTyping)));
      $effect(() => write(keys.stickersBuiltIn, String(this.stickersBuiltIn)));
      $effect(() => write(keys.stickersRoomPack, String(this.stickersRoomPack)));
      $effect(() => write(keys.stickersMine, String(this.stickersMine)));
      $effect(() => write(keys.threadsShown, this.threadsShown));
      $effect(() => write(keys.threadsHideReplies, String(this.threadsHideReplies)));
      $effect(() => {
        write(keys.language, this.language);
        i18n.locale = this.language === 'system' ? preferredLocale(navigator.languages ?? []) : this.language;
      });
      $effect(() => {
        const root = document.documentElement;
        root.dataset.accent = this.accent;
        if (this.tintsInterface) root.dataset.tint = '';
        else delete root.dataset.tint;
        if (this.font === 'inter') delete root.dataset.font;
        else root.dataset.font = this.font;
        if (this.appearance === 'system') delete root.dataset.theme;
        else root.dataset.theme = this.appearance;
      });
    });
  }
}

export const preferences = new Preferences();
