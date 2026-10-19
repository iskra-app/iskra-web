/**
 * Какая это сборка и где другая. Стабильная — web.iskra.wtf, из main; ночная — из dev, на
 * nightly.web.iskra.wtf: всё новое, и иногда сломанное. Человек на одной должен знать, что
 * есть вторая, — внизу экрана входа.
 */
export const channel = __ISKRA_CHANNEL__;
export const version = __ISKRA_VERSION__;
export const build = __ISKRA_BUILD__;

/** Сайт Искры — из любой сборки. Адрес показывается как есть, не переводится. */
export const website = { href: 'https://iskra.wtf', label: 'iskra.wtf' };

export const stableUrl = 'https://web.iskra.wtf/';
export const nightlyUrl = 'https://nightly.web.iskra.wtf/';
/** Куда ведёт ссылка «на другую»: из ночной — на стабильную, из стабильной — на ночную. */
export const otherChannelUrl = channel === 'nightly' ? stableUrl : nightlyUrl;
