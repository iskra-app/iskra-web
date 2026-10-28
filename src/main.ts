// Первым: забрать и стереть код авторизации из адреса (см. boot.ts).
import { authCallback } from './boot';
import { mount } from 'svelte';
import './design/base.css';
import './design/fonts/inter.css';
import App from './features/app/App.svelte';
import { preferences } from './features/app/preferences.svelte.ts';
import { i18n, preferredLocale } from './i18n/index.svelte.ts';

/**
 * Во фрейме — не запускаемся. На боевом адресе фрейм запрещён заголовком (`frame-ancestors`), а
 * ночная сборка живёт на GitHub Pages, где заголовков нет и CSP только тегом `<meta>`, — там
 * `frame-ancestors` не работает, и чужая страница могла бы встроить Iskra и подсунуть нажатие
 * («Подтвердить», «Присоединиться») под свою картинку. Пустая страница вместо этого.
 */
async function start() {
  const target = document.getElementById('app');
  if (!target) throw new Error('#app is missing from index.html');

  // Язык — до первого кадра: каталоги грузятся по одному (см. `i18n`), и экран без своего
  // каталога показал бы ключи.
  const language = preferences.language;
  await i18n.use(language === 'system' ? preferredLocale(navigator.languages ?? []) : language);

  return mount(App, { target, props: { authCallback } });
}

export default window.top === window.self ? await start() : undefined;
