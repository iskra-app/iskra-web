/**
 * Адрес своего файла из `public/` с учётом базового пути сборки: в корне домена это `/`,
 * в подпапке — например `/iskra-web/`. Писать `/icons/…` напрямую нельзя: там это чужой
 * корень.
 */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}
