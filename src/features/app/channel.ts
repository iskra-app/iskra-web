/**
 * Какая это сборка и где другая. Стабильная — web.iskra.wtf, из main; ночная — из dev, на
 * nightly.web.iskra.wtf: всё новое, и иногда сломанное. Человек на одной должен знать, что
 * есть вторая, — внизу экрана входа.
 */
/**
 * Стабильная — только на своём адресе. Всё остальное — ночная, превью, локальная, чья-то
 * копия — помечено как ночная: человек не должен принять её за боевую.
 */
export const channel: 'stable' | 'nightly' = globalThis.location?.hostname === 'web.iskra.wtf' ? 'stable' : 'nightly';
export const version = __ISKRA_VERSION__;
export const build = __ISKRA_BUILD__;

/** Сайт Искры — из любой сборки. Адрес показывается как есть, не переводится. */
export const website = { href: 'https://iskra.wtf', label: 'iskra.wtf' };

export const stableUrl = 'https://web.iskra.wtf/';
export const nightlyUrl = 'https://nightly.web.iskra.wtf/';
/** Куда ведёт ссылка «на другую»: из ночной — на стабильную, из стабильной — на ночную. */
export const otherChannelUrl = channel === 'nightly' ? stableUrl : nightlyUrl;
