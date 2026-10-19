import type { SettingsSection } from '../../core/navigation/route';
import type { TextKey } from '../../i18n/index.svelte.ts';

/** Заголовок страницы раздела — тот же, что у строки, которая к ней ведёт. */
export const settingsTitles: Record<SettingsSection, TextKey> = {
  profile: 'account.editTitle',
  appearance: 'settings.appearance',
  notifications: 'settings.notifications',
  security: 'settings.security',
  storage: 'settings.storage',
  about: 'settings.about',
};
