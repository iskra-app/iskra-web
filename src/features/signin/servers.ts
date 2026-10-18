/**
 * Публичные серверы для тех, у кого своего адреса нет, — `PublicServer` нативной Искры.
 *
 * Список короткий нарочно: из servers.joinmatrix.org оставлены только те, где «Создать
 * аккаунт» в Iskra правда работает — вход через OAuth с `prompt=create` в
 * `prompt_values_supported` (`GET /_matrix/client/v1/auth_metadata`). Прежде чем добавить
 * сервер — проверить это.
 */
import type { TextKey } from '../../i18n/index.svelte.ts';

export interface PublicServer {
  /** Что встаёт в поле адреса. Показывается как есть, не переводится. */
  address: string;
  about: TextKey;
  whereabouts: TextKey;
  /** Что стоит знать до выбора — своим цветом, а не ещё одной подробностью в описании. */
  warning?: TextKey;
}

/** Куда отправить того, кто хочет свой сервер: наша инструкция на iskra.wtf, как в нативной Искре. */
export const OWN_SERVER_GUIDE = 'https://iskra.wtf/server.html';

/**
 * Русский среди языков браузера или Россия в регионе. matrix.org из России может не
 * отвечать — об этом говорится только тем, кого это касается; остальным это шум.
 */
export function isRussianLocale(languages: readonly string[]): boolean {
  return languages.some((tag) => {
    const [language, ...rest] = tag.toLowerCase().split('-');
    return language === 'ru' || rest.includes('ru');
  });
}

export function publicServers(languages: readonly string[]): PublicServer[] {
  return [
    {
      address: 'matrix.org',
      about: 'servers.matrixOrg',
      whereabouts: 'servers.matrixOrgWhere',
      ...(isRussianLocale(languages) ? { warning: 'servers.matrixOrgBlocked' as const } : {}),
    },
    { address: 'tchncs.de', about: 'servers.tchncs', whereabouts: 'servers.tchncsWhere' },
    { address: 'quassel.io', about: 'servers.quassel', whereabouts: 'servers.quasselWhere' },
    { address: 'nope.chat', about: 'servers.nopeChat', whereabouts: 'servers.nopeChatWhere' },
  ];
}
