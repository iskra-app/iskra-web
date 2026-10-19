/**
 * Чей код едет внутри приложения, под какой лицензией, и текст каждой — `LicensesView`
 * нативной Искры. Не украшение: лицензии путешествуют вместе со сборкой, и где-то в ней
 * человек должен мочь их прочесть. Тексты — свои копии в репозитории, а не ссылки: ссылка
 * завтра может вести в никуда и без сети не открывается. Загружаются отдельными кусками
 * сборки — только когда их открыли.
 *
 * Имена и названия лицензий не переводятся: «Apache 2.0» — так её зовут на любом языке, а
 * имена проектов — имена. Тексты тоже: лицензия — только её английский текст.
 */
export interface Licence {
  name: string;
  kind: string;
  text: () => Promise<string>;
}

const raw = (load: () => Promise<{ default: string }>) => () => load().then((module) => module.default);

export const iskraLicence: Licence = { name: 'Iskra Web', kind: 'GPL-3.0', text: raw(() => import('../../../LICENSE?raw')) };

/** На чём всё держится — то, что попадает в сборку. */
export const builtOn: Licence[] = [
  { name: 'matrix-js-sdk', kind: 'Apache 2.0', text: raw(() => import('./licences/matrix-js-sdk.txt?raw')) },
  // Rust-крипто из matrix-rust-sdk в WebAssembly — под той же лицензией: один текст под двумя именами.
  { name: 'matrix-sdk-crypto-wasm', kind: 'Apache 2.0', text: raw(() => import('./licences/matrix-js-sdk.txt?raw')) },
  { name: 'matrix-encrypt-attachment', kind: 'Apache 2.0', text: raw(() => import('./licences/matrix-encrypt-attachment.txt?raw')) },
  { name: 'Svelte', kind: 'MIT', text: raw(() => import('./licences/svelte.txt?raw')) },
  { name: 'DOMPurify', kind: 'MPL-2.0 / Apache 2.0', text: raw(() => import('./licences/dompurify.txt?raw')) },
  { name: 'commonmark.js', kind: 'BSD-2-Clause', text: raw(() => import('./licences/commonmark.txt?raw')) },
  { name: 'blobatar', kind: 'MIT', text: raw(() => import('./licences/blobatar.txt?raw')) },
  { name: 'Inter', kind: 'OFL-1.1', text: raw(() => import('./licences/inter.txt?raw')) },
  { name: 'Material Symbols', kind: 'Apache 2.0', text: raw(() => import('./licences/material-symbols.txt?raw')) },
  { name: 'uqr', kind: 'MIT', text: raw(() => import('./licences/uqr.txt?raw')) },
];

/** Браузер и система — для строки «Устройство», как модель и версия ОС у нативной. Порядок
 * важен: Edge притворяется Chrome, а Chrome — Safari. */
const browsers: Array<[string, RegExp]> = [
  ['Edge', /Edg\/(\d+)/],
  ['Firefox', /Firefox\/(\d+)/],
  ['Chrome', /Chrome\/(\d+)/],
  ['Safari', /Version\/([\d.]+).*Safari/],
];
const systems: Array<[string, RegExp]> = [
  ['Android', /Android/],
  ['iOS', /iPhone|iPad/],
  ['macOS', /Mac OS X/],
  ['Windows', /Windows/],
  ['ChromeOS', /CrOS/],
  ['Linux', /Linux/],
];

export function describeDevice(agent = navigator.userAgent): string {
  const browser = browsers.map(([name, pattern]) => [name, pattern.exec(agent)?.[1]] as const).find(([, version]) => version);
  const system = systems.find(([, pattern]) => pattern.test(agent))?.[0];
  return [browser ? `${browser[0]} ${browser[1]}` : '', system ?? ''].filter(Boolean).join(' · ') || agent;
}
