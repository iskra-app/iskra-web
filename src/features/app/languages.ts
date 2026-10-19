import { locales, type TextKey } from '../../i18n/index.svelte.ts';
import type { LanguageChoice } from './preferences.svelte.ts';

/**
 * Выбор языка — в настройках и на первом экране входа. Каждый язык — своим именем: ищут свой,
 * а не перевод его названия на чужой.
 */
export const languageChoices: Array<{ value: LanguageChoice; label: TextKey }> = [
  { value: 'system', label: 'language.system' },
  ...locales.map((locale) => ({ value: locale, label: `language.${locale}` as const })),
];
