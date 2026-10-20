/**
 * Переводы.
 *
 * Выбор этапа 1 (см. план, «Стек»): не Paraglide, а свой маленький модуль на JSON.
 * Требование было одно — пропущенный ключ должен быть ошибкой сборки, а не строкой
 * `signIn.title` на экране, — и TypeScript даёт его сам: ключи — это `keyof` русского
 * каталога, а английский обязан быть `Catalog` того же набора ключей. Лишние ключи
 * в английском и формы плюралей ловит тест `tests/unit/i18n.test.ts`. Ни компилятора,
 * ни плагина, ни рантайма больше этого файла.
 *
 * Каталоги грузятся по требованию, каждый своим файлом: из семи языков читающему нужен один, а
 * вместе они — пятая часть приложения. Нужный подгружается до первого кадра (`i18n.use` в
 * `main.ts`), остальные — когда их выберут; до тех пор на экране прежний язык, а не ключи.
 *
 * Русский пишется первым, английский — вторым. Тексты, общие с нативной Искрой,
 * переносятся дословно из её Localizable.strings — с тем же ключом. Остальные языки — те же,
 * что у нативной (de, es, fr, ja, zh-Hans): общее — из её переводов, своё веба — переведено
 * здесь, на «вы», как там.
 */
type Ru = typeof import('./ru.json');
export type MessageKey = keyof Ru;
/** Ключи, у которых значение — формы плюраля, а не строка. */
export type PluralKey = { [K in MessageKey]: Ru[K] extends string ? never : K }[MessageKey];
export type TextKey = Exclude<MessageKey, PluralKey>;

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Catalog = { [K in MessageKey]: Ru[K] extends string ? string : PluralForms };

export const locales = ['ru', 'en', 'de', 'es', 'fr', 'ja', 'zh'] as const;
export type Locale = (typeof locales)[number];

const loaders = import.meta.glob<Catalog>('./*.json', { import: 'default' });

/** Загруженные каталоги. Пусто — язык ещё не нужен был ни разу. */
export const catalogs: Partial<Record<Locale, Catalog>> = {};

/** Подгрузить каталог языка — один раз; повторно — тот же ответ. */
export async function loadCatalog(locale: Locale): Promise<Catalog> {
  const loaded = catalogs[locale];
  if (loaded) return loaded;
  const catalog = await loaders[`./${locale}.json`]!();
  catalogs[locale] = catalog;
  return catalog;
}

/**
 * Первый язык из `navigator.languages`, который у нас есть; иначе английский. Китайский у нас
 * только упрощённый — традиционному (`zh-Hant`, `zh-TW`, `zh-HK`) честнее английский, чем
 * чужая письменность.
 */
export function preferredLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const parts = tag.toLowerCase().split('-');
    if (parts[0] === 'zh' && parts.slice(1).some((p) => p === 'hant' || p === 'tw' || p === 'hk' || p === 'mo')) continue;
    const found = locales.find((l) => l === parts[0]);
    if (found) return found;
  }
  return 'en';
}

type Params = Record<string, string | number>;

function interpolate(template: string, params: Params | undefined, locale: Locale): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole;
    return typeof value === 'number' ? value.toLocaleString(locale) : value;
  });
}

export function translate(locale: Locale, key: TextKey, params?: Params): string {
  const text = catalogs[locale]?.[key] as string | undefined;
  return text === undefined ? key : interpolate(text, params, locale);
}

export function translatePlural(
  locale: Locale,
  key: PluralKey,
  count: number,
  params?: Params,
): string {
  const forms = catalogs[locale]?.[key] as PluralForms | undefined;
  if (!forms) return key;
  const rule = new Intl.PluralRules(locale).select(count);
  return interpolate(forms[rule] ?? forms.other, { count, ...params }, locale);
}

class I18n {
  /** Язык на экране — меняется, только когда его каталог уже здесь. */
  #current = $state<Locale>(typeof navigator === 'undefined' ? 'ru' : preferredLocale(navigator.languages ?? []));
  /** Последний попрошенный: пока грузится один, могли попросить другой. */
  #wanted: Locale = this.#current;

  get locale(): Locale {
    return this.#current;
  }

  /** Сменить язык. Каталог не загружен — сменится, когда загрузится. */
  set locale(locale: Locale) {
    this.#wanted = locale;
    if (catalogs[locale]) {
      this.#current = locale;
      return;
    }
    void loadCatalog(locale).then(() => {
      if (this.#wanted === locale) this.#current = locale;
    });
  }

  /** Перед первым кадром: загрузить язык и встать на него. */
  async use(locale: Locale): Promise<void> {
    this.#wanted = locale;
    await loadCatalog(locale);
    if (this.#wanted === locale) this.#current = locale;
  }

  t = (key: TextKey, params?: Params): string => translate(this.locale, key, params);

  plural = (key: PluralKey, count: number, params?: Params): string =>
    translatePlural(this.locale, key, count, params);
}

export const i18n = new I18n();
export const t = i18n.t;
export const plural = i18n.plural;
