import type { SettingsSection } from '../../core/navigation/route';
import type { TextKey } from '../../i18n/index.svelte.ts';

/** Заголовок страницы раздела — тот же, что у строки, которая к ней ведёт. */
export const settingsTitles: Record<SettingsSection, TextKey> = {
  profile: 'account.editTitle',
  appearance: 'settings.appearance',
  reactions: 'settings.reactionsWeb',
  chats: 'settings.chats',
  folders: 'folders.title',
  notifications: 'settings.notifications',
  security: 'settings.security',
  media: 'settings.media',
  storage: 'settings.storage',
  about: 'settings.about',
};
