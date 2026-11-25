import { mount } from 'svelte';
import '../src/design/base.css';
import '../src/design/fonts/inter.css';
import { i18n } from '../src/i18n/index.svelte.ts';
import Catalog from './Catalog.svelte';

const locale = navigator.language.startsWith('ru') ? 'ru' : 'en';
await i18n.use(locale);
document.documentElement.lang = locale;
mount(Catalog, { target: document.getElementById('app')!, props: { locale } });
