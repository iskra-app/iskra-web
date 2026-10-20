// Первым: забрать и стереть код авторизации из адреса (см. boot.ts).
import { authCallback } from './boot';
import { mount } from 'svelte';
import './design/base.css';
import './design/fonts/inter.css';
import App from './features/app/App.svelte';
import { preferences } from './features/app/preferences.svelte.ts';
import { i18n, preferredLocale } from './i18n/index.svelte.ts';

const target = document.getElementById('app');
if (!target) throw new Error('#app is missing from index.html');

// Язык — до первого кадра: каталоги грузятся по одному (см. `i18n`), и экран без своего
// каталога показал бы ключи.
const language = preferences.language;
await i18n.use(language === 'system' ? preferredLocale(navigator.languages ?? []) : language);

export default mount(App, { target, props: { authCallback } });
