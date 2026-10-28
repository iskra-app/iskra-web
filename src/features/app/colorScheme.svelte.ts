import { preferences } from './preferences.svelte.ts';

/**
 * Какая тема сейчас на экране: выбранная вручную или, при «Как в системе», системная.
 * Реактивно — и на смену выбора, и на смену темы ОС (`matchMedia`, как `viewport.svelte.ts`).
 */
class ColorScheme {
  private systemDark = $state(false);

  /** Светлая ли тема сейчас на экране. */
  light = $derived(preferences.appearance === 'system' ? !this.systemDark : preferences.appearance === 'light');

  constructor() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => (this.systemDark = dark.matches);
    update();
    dark.addEventListener('change', update);
  }
}

export const colorScheme = new ColorScheme();
