// Тесты меняют язык на лету и сразу читают тексты — все каталоги здесь заранее.
import { loadCatalog, locales } from '../../src/i18n/index.svelte.ts';

await Promise.all(locales.map(loadCatalog));
