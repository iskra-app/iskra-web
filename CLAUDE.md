# CLAUDE.md

Iskra Web — веб-клиент Matrix (десктоп в браузере или как PWA, и Android-PWA). Одна кодовая
база на TypeScript + Svelte 5; протокол и шифрование — `matrix-js-sdk` с Rust-крипто в WASM.

`iskra-web.md` — план и обоснования решений; читать перед тем, как менять любое из них.
`ROADMAP.md` — что сделано и что дальше; закрытый пункт отмечается там же, в том же коммите.

Нативная Искра — `iskra-app/iskra` (локально `../iskra`), работа идёт в ветке **dev**; она — эталон
экранов и поведения. Токены (`Theme.swift`), акценты (`AccentTheme.swift`), тексты
(`Localizable.strings`) и иконку берём оттуда, из dev. Коммиты оттуда переносятся скиллом
`/port-from-ios` (`.claude/skills/port-from-ios/`); перенесённое помечено трейлером `iOS-Commit`.

## Команды

```sh
pnpm install
pnpm dev            # dev-сервер с dev-CSP
pnpm lint           # ESLint, включая границы слоёв
pnpm check          # svelte-check: типы, в том числе ключи переводов
pnpm test           # Vitest — tests/unit
pnpm build && pnpm preview   # сборка с боевой CSP и Trusted Types
pnpm e2e            # Playwright — tests/e2e, три движка × телефон/десктоп
PW_ENGINES=chromium pnpm e2e # один движок
pnpm icons          # перегенерировать public/icons из assets/iskra-spark.svg
ISKRA_META_CSP=1 pnpm build   # как ночная сборка для GitHub Pages (nightly.web.iskra.wtf)
# боевая (web.iskra.wtf) — обычная pnpm build из main, VPS с nginx: см. deploy/README.md
ISKRA_BASE=/iskra-web/ pnpm build   # сборка в подпапке — проверить, что нет путей от корня
```

В облачном контейнере Chromium уже стоит, и его версия может не совпасть с Playwright:
`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium PW_ENGINES=chromium pnpm e2e`.

## Слои

| Каталог | Держит | Может импортировать |
|---|---|---|
| `src/core/` | Matrix: сессия, комнаты, лента, демо-сервер, адрес | `matrix-js-sdk`. Никогда `.svelte`, `design/`, `features/` |
| `src/design/` | Компоненты, токены, раскладка колонок | Svelte. Никогда Matrix и `core/` |
| `src/features/` | Экраны, настройки устройства | Всё — единственное место встречи |
| `src/i18n/` | `ru.json` (первым), `en.json` (вторым), `de` `es` `fr` `ja` `zh` — как в нативной | Ничего |

Проверяет ESLint (`no-restricted-imports` в `eslint.config.js`). `core/` отдаёт наверх свои
типы, никогда `MatrixEvent` или `Room`. Сторы — классы в `.svelte.ts` с `$state`, и
импортируются они **с полным расширением** (`'./app.svelte.ts'`): иначе правило слоёв не
отличит их от компонентов.

## Сессия

`src/boot.ts` — первый исполняемый модуль: забирает код авторизации из адреса и стирает
его `replaceState`. `core/session/app.svelte.ts` — машина состояний (`loading`, `signed-out`,
`elsewhere`, `signed-in`); `UserSession` — единственный владелец `MatrixClient`.
Токены — только через `core/storage/vault.ts`, под неизвлекаемым ключом.

Демо: адрес `demo.iskra.invalid`, `alice` / `password` (в `pnpm dev` хватает `demo`).

## Правила, которые легко нарушить

- **Ни одной пользовательской строки в разметке.** Только `t('key')`; `aria-label`, `title`,
  тултипы — тоже. Тест `tests/unit/i18n.test.ts` ищет голый текст в каждом `.svelte`.
  Новый ключ — сначала в `ru.json`, потом в `en.json`, потом в остальные пять (`de`, `es`,
  `fr`, `ja`, `zh` — упрощённый китайский): тест требует одинаковый набор ключей у всех.
  Текст, который есть в нативной Искре, переносится дословно и с тем же ключом — из её
  `*.lproj` для каждого языка; своё веба переводится на «вы» (`Sie`, `usted`, `vous`, `您`).
- **Никаких чисел в стилях компонентов** — только переменные из `tokens.css`. Всё кратно 4 px,
  в rem.
- **Главная кнопка:** фон `--accent`, надпись `--on-accent`. Никогда «цвет текста» на акценте.
- **CSP.** Никаких inline-скриптов и стилей в сборке, никаких сторонних скриптов, шрифтов,
  CDN. Новое место, пишущее в `innerHTML` или регистрирующее скрипт, требует политики
  Trusted Types и строки в `security-headers.ts`, иначе упадёт только в сборке — поэтому
  Playwright гоняется против `vite preview`, а не `vite dev`.
- **Никаких путей от корня** (`/icons/…`, `/sw.js`): сборка может жить в подпапке (`ISKRA_BASE`),
  как ночная жила в `/iskra-web/`, пока у неё не было своего домена.
  Свои файлы — через `asset()` из `design/asset.ts` или `import.meta.env.BASE_URL`.
- **Ничего не логируется.** `no-console` включён; `matrix-js-sdk` получает `quietLogger()`.
- **Демо-сервер держит `unknown` пустым.** SDK начал спрашивать новое — добавить маршрут в
  `src/core/demo/server.ts` (ответ «не поддерживается» — тоже ответ), а не ослаблять тест.
- **Лента начинается пустой, историю надо попросить** — явно и в цикле, пока не наберётся
  на высоту окна (см. план, «Лента»).
- **Element Web — AGPL.** Читать можно, копировать нельзя.
