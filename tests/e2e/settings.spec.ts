import { expect, test, type Page } from '@playwright/test';
import { consoleOf, isPhone, openRoom, signInToDemo, signOut, watchForProblems } from './helpers';

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) console.log(`Консоль «${info.title}»:\n${consoleOf(page).slice(-40).join('\n')}`);
});

/** Настройки — список разделов; `row` — открыть раздел этой строки. */
async function openSettings(page: Page, row?: string) {
  const settings = page.getByRole('button', { name: 'Настройки' });
  const back = page.getByRole('button', { name: 'Назад' });
  // Из чата на телефоне кнопки не видно — сначала к списку.
  await expect(async () => {
    if (!(await settings.isVisible())) await back.click({ timeout: 1000 });
    await expect(settings).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await settings.click();
  if (row) await page.getByRole('navigation', { name: 'Настройки' }).getByRole('link', { name: row }).click();
}

async function openPanel(page: Page) {
  await page.getByRole('button', { name: 'О чате' }).click();
  const panel = page.getByRole('radiogroup', { name: 'Уведомления' }).locator('xpath=ancestor::div[contains(@class,"panel")][1]');
  await expect(panel).toBeVisible();
  return panel;
}

test('«О чате» в личном чате: ID собеседника, «Поделиться», «Заблокировать», «Удалить чат»', async ({ page }, info) => {
  const problems = watchForProblems(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  const panel = await openPanel(page);
  await expect(panel.locator('header')).toContainText('@anya:demo.iskra.invalid');
  await expect(panel.locator('header')).toContainText('Переписка зашифрована');
  if (!isPhone(info.project.name) && info.project.name.startsWith('chromium')) {
    await panel.getByRole('button', { name: 'Поделиться' }).click();
    await expect(panel.getByRole('status')).toHaveText('Ссылка скопирована');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://matrix.to/#/%40anya%3Ademo.iskra.invalid');
  } else {
    await expect(panel.getByRole('button', { name: 'Поделиться' })).toBeVisible();
  }
  await panel.getByRole('button', { name: 'Заблокировать пользователя' }).click();
  await expect(panel).toContainText('Вы заблокировали этого пользователя');
  await panel.getByRole('button', { name: 'Разблокировать пользователя' }).click();
  await expect(panel.getByRole('button', { name: 'Заблокировать пользователя' })).toBeVisible();
  await panel.getByRole('button', { name: 'Удалить чат' }).click();
  await expect(page.getByRole('dialog', { name: 'Удалить чат?' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('«О чате» там, где прав нет: шапка, кнопки, уведомления, закреплённые, участники', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const panel = await openPanel(page);
  await expect(panel.getByRole('button', { name: 'Изменить' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: /Борис.*Администратор/ })).toBeVisible();
  await expect(panel).toContainText('3 участника');

  // Шапка — как в нативной: сколько участников и что с шифрованием; под ней — кнопки.
  await expect(panel.locator('header')).toContainText('3 участника');
  await expect(panel.locator('header')).toContainText('Переписка не зашифрована');
  await expect(panel.getByRole('button', { name: 'Пригласить' })).toBeVisible();

  const alerts = panel.getByRole('radiogroup', { name: 'Уведомления' });
  await expect(alerts.getByRole('radio', { name: 'Все сообщения' })).toHaveAttribute('aria-checked', 'true');
  // «Без звука» под шапкой — то же, что «Выключены».
  await panel.getByRole('button', { name: 'Без звука' }).click();
  await expect(alerts.getByRole('radio', { name: 'Выключены' })).toHaveAttribute('aria-checked', 'true');
  await expect(panel.getByRole('button', { name: 'Со звуком' })).toBeVisible();

  // Закреплённое из панели ведёт к сообщению.
  await panel.getByRole('button', { name: /Кто что берёт на пикник/ }).click();
  await expect(page.getByRole('log').getByRole('article').filter({ hasText: 'Кто что берёт на пикник?' })).toBeInViewport();
  expect(problems).toEqual([]);
});

test('своя комната: изменить название, дать роль, пригласить — и кривой адрес', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Длинная история/);
  const panel = await openPanel(page);

  await panel.getByRole('button', { name: 'Изменить' }).click();
  const edit = page.getByRole('dialog', { name: 'Изменить чат' });
  await edit.getByRole('textbox', { name: 'Название' }).fill('Очень длинная история');
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(edit).toBeHidden();
  await expect(panel.getByRole('heading', { name: 'Очень длинная история' })).toBeVisible({ timeout: 10_000 });

  await panel.getByRole('button', { name: /^Борис/ }).click();
  await page.getByRole('menuitem', { name: 'Роль' }).click();
  const role = page.getByRole('dialog', { name: 'Что может Борис?' });
  await role.getByRole('radio', { name: 'Модератор' }).click();
  await expect(panel.getByRole('button', { name: /Борис.*Модератор/ })).toBeVisible({ timeout: 10_000 });

  await panel.getByRole('button', { name: 'Пригласить' }).click();
  const invite = page.getByRole('dialog', { name: 'Кого пригласить?' });
  await invite.getByRole('textbox').fill('аня');
  await invite.getByRole('button', { name: 'Пригласить' }).click();
  await expect(invite).toContainText('Проверьте адрес');
  await invite.getByRole('textbox').fill('@anya:demo.iskra.invalid');
  await invite.getByRole('button', { name: 'Пригласить' }).click();
  await expect(invite).toBeHidden();
  await expect(panel.getByRole('button', { name: /Аня.*Приглашение отправлено/ })).toBeVisible({ timeout: 10_000 });
});

test('выйти из чата — с вопросом, и чата больше нет в списке', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Дом 14/);
  const panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Выйти из чата' }).click();
  const dialog = page.getByRole('dialog', { name: 'Выйти из чата?' });
  await expect(dialog).toContainText('только по приглашению');
  await dialog.getByRole('button', { name: 'Выйти из чата' }).click();
  await expect(page.getByRole('link', { name: /^Дом 14/ })).toHaveCount(0, { timeout: 10_000 });
});

test('новая комната и новый чат — создаются и сразу открываются', async ({ page }) => {
  await signInToDemo(page);
  await page.getByRole('button', { name: 'Новый чат или комната' }).click();
  const dialog = page.getByRole('dialog', { name: 'Новый чат или комната' });
  await dialog.getByRole('tab', { name: 'Новая комната' }).click();
  await expect(dialog).toContainText('поэтому шифрования в ней нет');
  await dialog.getByRole('textbox', { name: 'Название' }).fill('Книги');
  await dialog.getByRole('button', { name: 'Создать' }).click();
  await expect(page.getByRole('heading', { name: 'Книги', level: 1 })).toBeVisible({ timeout: 10_000 });

  // Кнопка — в шапке списка; на телефоне список — за «Назад».
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await page.getByRole('button', { name: 'Новый чат или комната' }).click();
  await dialog.getByRole('textbox', { name: 'Кому написать' }).fill('@anya:demo.iskra.invalid');
  await dialog.getByRole('button', { name: 'Начать' }).click();
  // С Аней чат уже есть — открывается он, а не второй.
  await expect(page.getByRole('log')).toContainText('Возьми плед, там ветрено', { timeout: 10_000 });
});

test('настройки по разделам: имя, язык, тема, шрифт; устройство и хранилище видны', async ({ page }, info) => {
  await signInToDemo(page);
  await openSettings(page);
  const back = page.getByRole('button', { name: 'Назад' });
  // Профиль — шапкой над разделами, «Изменить» — карандаш в шапке экрана.
  await page.getByRole('button', { name: 'Изменить' }).click();
  await expect(page.getByRole('heading', { name: 'Ваш профиль', level: 1 })).toBeVisible();

  const name = page.getByRole('textbox', { name: 'Имя' });
  await name.fill('Алиса Петровна');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('button', { name: 'Сохранить' })).toBeDisabled({ timeout: 10_000 });

  // «Назад» из раздела — к списку разделов, не к чатам; новое имя — в шапке.
  await back.click();
  await expect(page.getByRole('heading', { name: 'Настройки', level: 1 })).toBeVisible();
  await expect(page.getByText('Алиса Петровна', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('link', { name: 'Безопасность' }).click();
  await expect(page.getByText('Это устройство', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Заблокированные' })).toBeVisible();
  await back.click();
  await page.getByRole('link', { name: 'Хранилище' }).click();
  await expect(page.getByRole('heading', { name: 'Хранилище', level: 1 })).toBeVisible();
  await back.click();
  await page.getByRole('link', { name: 'Внешний вид' }).click();

  await page.getByRole('radio', { name: 'Тёмное' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // Inter — по умолчанию и из своих файлов под боевой CSP: кириллица и латиница загрузились.
  await expect(page.getByRole('radio', { name: 'Inter' })).toHaveAttribute('aria-checked', 'true');
  const bodyFont = () => page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(await bodyFont()).toMatch(/^"?Inter"?,/);
  expect(await page.evaluate(async () => (await document.fonts.load('1rem Inter', 'Привет, hello')).length)).toBeGreaterThan(1);
  await page.getByRole('radio', { name: 'Системный' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'system');
  expect(await bodyFont()).toMatch(/^system-ui,/);
  await page.getByRole('radio', { name: 'Inter' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-font');

  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Appearance', level: 1 })).toBeVisible();
  // Языки нативной — каждый своим именем; китайский — с письменностью в `lang`.
  await page.getByRole('radio', { name: '简体中文' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await page.getByRole('radio', { name: 'Deutsch' }).click();
  await expect(page.getByRole('heading', { name: 'Darstellung', level: 1 })).toBeVisible();
  await page.getByRole('radio', { name: 'Русский' }).click();
  await expect(page.getByRole('heading', { name: 'Внешний вид', level: 1 })).toBeVisible();

  // Старый адрес раздела ведёт туда, куда раздел переехал.
  await page.goto('/#/settings/blocked', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Безопасность', level: 1 })).toBeVisible({ timeout: 20_000 });

  if (!isPhone(info.project.name)) {
    // `Ctrl/⌘ ,` — из любого места.
    await page.goto('/#/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Чаты', level: 1 })).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('ControlOrMeta+Comma');
    await expect(page.getByRole('heading', { name: 'Настройки', level: 1 })).toBeVisible();
  }
});

test('заблокировать из меню сообщения — сообщений не видно; разблокировать — в настройках', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Дом 14/);
  const bubble = page.getByRole('log').getByRole('article').filter({ hasText: 'Лифт опять не работает' });
  await bubble.click({ button: 'right' });
  await page.getByRole('menu', { name: 'Ещё' }).getByRole('menuitem', { name: 'Заблокировать' }).click();
  const dialog = page.getByRole('dialog', { name: 'Заблокировать Вера?' });
  await expect(dialog).toContainText('Разблокировать можно в настройках');
  await dialog.getByRole('button', { name: 'Заблокировать' }).click();
  await expect(bubble).toHaveCount(0, { timeout: 10_000 });
  // Служебная строка о ней остаётся: блокировка прячет слова, а не факт, что человек в чате.
  await expect(page.getByRole('log')).toContainText('Повестка');

  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  // И в списке чатов её слова не превью.
  await expect(page.getByRole('link', { name: /^Дом 14/ })).not.toContainText('Лифт опять');

  await openSettings(page, 'Безопасность');
  const section = page.getByRole('region', { name: 'Заблокированные' });
  await expect(section).toContainText('@vera:demo.iskra.invalid');
  await section.getByRole('button', { name: 'Разблокировать' }).click();
  await expect(section).toContainText('Никто не заблокирован', { timeout: 10_000 });
  expect(problems).toEqual([]);
});

test('«О чате»: вкладки «Что внутри» — фото, файлы, ссылки из загруженной ленты', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const panel = await openPanel(page);
  const tabs = panel.getByRole('tablist', { name: 'Что внутри' });
  // Кружков в «Выходных» нет — и вкладки для них нет.
  await expect(tabs.getByRole('tab')).toHaveText(['Участники', 'Фото и видео', 'Голосовые', 'Файлы', 'Ссылки']);
  await expect(tabs.getByRole('tab', { name: 'Участники' })).toHaveAttribute('aria-selected', 'true');

  await tabs.getByRole('tab', { name: 'Фото и видео' }).click();
  const grid = panel.getByRole('tabpanel');
  await expect(grid.getByRole('button', { name: 'Фото' })).toHaveCount(2);
  // Стрелки ходят по вкладкам. Голосовое — тем же пузырём, что в ленте.
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Голосовые' })).toBeFocused();
  await expect(panel.getByRole('tabpanel').getByRole('button', { name: 'Слушать' })).toBeVisible();
  await expect(panel.getByRole('tabpanel')).toContainText('0:04');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Файлы' })).toBeFocused();
  await expect(panel.getByRole('tabpanel')).toContainText('Что взять.txt');
  await page.keyboard.press('ArrowRight');
  const link = panel.getByRole('tabpanel').getByRole('link', { name: 'https://example.org/weather' });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(panel.getByRole('tabpanel')).toContainText('вроде солнце');

  await tabs.getByRole('tab', { name: 'Фото и видео' }).click();
  await panel.getByRole('tabpanel').getByRole('button', { name: 'Фото' }).first().click();
  // Просмотрщик листает фото этой вкладки, новое — первым.
  const viewer = page.getByRole('dialog', { name: 'Фото' });
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText('1 из 2');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  expect(problems).toEqual([]);
});

test('локальное имя личного чата: видно везде, переживает перезагрузку, возвращается', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  let panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Изменить' }).click();
  const edit = page.getByRole('dialog', { name: 'Изменить чат' });
  // В личном чате — одно поле; имя, описание и фото комнаты принадлежат собеседнику.
  await expect(edit.getByRole('textbox')).toHaveCount(1);
  const field = edit.getByRole('textbox', { name: 'Имя на этом устройстве' });
  await expect(field).toHaveAttribute('placeholder', 'Аня');
  await field.fill('Анечка');
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(edit).toBeHidden();
  await expect(panel.getByRole('heading', { name: 'Анечка' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'О чате' })).toBeVisible({ timeout: 15_000 });
  // И в списке, и в шапке чата.
  await openRoom(page, /^Анечка/);
  await expect(page.getByRole('heading', { name: 'Анечка', level: 1 })).toBeVisible();

  panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Изменить' }).click();
  await page.getByRole('dialog', { name: 'Изменить чат' }).getByRole('button', { name: 'Вернуть настоящее имя' }).click();
  await expect(panel.getByRole('heading', { name: 'Аня' })).toBeVisible();
  // На телефоне панель — лист поверх чата: сначала закрыть её.
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await expect(page.getByRole('link', { name: /^Аня/ })).toBeVisible();
  expect(problems).toEqual([]);
});

test('обои: градиент за перепиской и непрозрачные пузыри; своё фото — до выхода из аккаунта', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openSettings(page, 'Внешний вид');
  const tiles = page.getByRole('radiogroup', { name: 'Обои' });
  await expect(tiles.getByRole('radio', { name: 'Без обоев' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('slider')).toHaveCount(0);
  await tiles.getByRole('radio', { name: 'Море' }).click();
  await expect(page.getByRole('slider')).toBeVisible();

  await openRoom(page, /^Аня/);
  const room = page.getByRole('region', { name: 'Переписка' });
  await expect(room).toHaveAttribute('data-wallpaper', '');
  // На обоях входящий пузырь — непрозрачный, а не восемь процентов чёрного.
  const bubble = page.getByRole('log').getByRole('article').filter({ hasText: 'Возьми плед' });
  await expect.poll(() => bubble.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(252, 252, 252)');

  // Своё фото: выбрать — и оно за перепиской, и переживает перезагрузку.
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await openSettings(page, 'Внешний вид');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const chooser = page.waitForEvent('filechooser');
  await tiles.getByRole('radio', { name: 'Своё фото' }).click();
  await (await chooser).setFiles({ name: 'wall.png', mimeType: 'image/png', buffer: png });
  await expect(tiles.getByRole('radio', { name: 'Своё фото' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Выбрать другое фото' })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  // Сначала дождаться экрана: `openRoom` спрашивает «видно ли „Назад“» один раз и сразу.
  await expect(page.getByRole('heading', { name: 'Внешний вид', level: 1 })).toBeVisible({ timeout: 20_000 });
  await openRoom(page, /^Аня/);
  await expect(page.locator('[data-wallpaper-kind="photo"] img')).toBeVisible();

  if (await back.isVisible()) await back.click();
  await signOut(page);
  await expect.poll(async () => (await page.evaluate(() => indexedDB.databases())).map((d) => d.name)).not.toContain('iskra-wallpaper');
  expect(problems).toEqual([]);
});

test('компактный вид: без пузырей, имя — у каждой серии, в личном чате тоже', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  const log = page.getByRole('log');
  // В пузырях личного чата имён нет: и так понятно, кто говорит.
  await expect(log.getByText('Алиса', { exact: true })).toHaveCount(0);

  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await openSettings(page, 'Внешний вид');
  await page.getByRole('switch', { name: 'Компактный вид' }).check();

  await openRoom(page, /^Аня/);
  // Своё выглядит как чужое — и только имя говорит, кто писал.
  await expect(log.getByText('Алиса', { exact: true }).first()).toBeVisible();
  const own = log.getByRole('article').filter({ hasText: 'Поеду! Во сколько?' });
  await expect.poll(() => own.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
});

test('уведомления аккаунта: группы — только упоминания, приглашения выключены; открыл заново — так же', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openSettings(page, 'Уведомления');
  const section = page;
  const groups = section.getByRole('radiogroup', { name: 'Группы' });
  await expect(groups.getByRole('radio', { name: 'Все сообщения' })).toHaveAttribute('aria-checked', 'true');
  // Умолчание «выключены» не бывает: без notify оно и есть «только упоминания».
  await expect(groups.getByRole('radio', { name: 'Выключены' })).toHaveCount(0);
  await groups.getByRole('radio', { name: 'Только упоминания' }).click();
  await expect(groups.getByRole('radio', { name: 'Только упоминания' })).toHaveAttribute('aria-checked', 'true');
  await expect(section.getByRole('radiogroup', { name: 'Личные чаты' }).getByRole('radio', { name: 'Все сообщения' })).toHaveAttribute('aria-checked', 'true');

  const invitations = section.getByRole('switch', { name: 'Приглашения в чаты' });
  await expect(invitations).toBeChecked();
  await invitations.click();
  await expect(invitations).not.toBeChecked();
  await expect(section.getByRole('switch', { name: 'Когда меня упоминают' })).toBeChecked();

  // Правила — на сервере: раздел, открытый заново, перечитывает их оттуда.
  await page.getByRole('button', { name: 'Назад' }).click();
  await page.getByRole('link', { name: 'Уведомления' }).click();
  await expect(section.getByRole('radiogroup', { name: 'Группы' }).getByRole('radio', { name: 'Только упоминания' })).toHaveAttribute('aria-checked', 'true');
  await expect(section.getByRole('switch', { name: 'Приглашения в чаты' })).not.toBeChecked();
  expect(problems).toEqual([]);
});

test('«Чаты»: вход и выход спрятаны — строки нет, сообщения на месте; вернули — снова видна', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const log = page.getByRole('log');
  await expect(log).toContainText('Борис и Вера теперь в чате');

  await openSettings(page, 'Чаты');
  const membership = page.getByRole('switch', { name: 'Скрывать вход и выход участников' });
  await membership.check();
  await openRoom(page, /^Выходные/);
  await expect(log).toContainText('Кто что берёт на пикник?');
  await expect(log).not.toContainText('теперь в чате');

  await openSettings(page, 'Чаты');
  await membership.uncheck();
  await openRoom(page, /^Выходные/);
  await expect(log).toContainText('Борис и Вера теперь в чате');
});

test('«Чаты»: отправлять по Ctrl/⌘ Enter — Enter переносит строку', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'на сенсорном Enter и так переносит, а настройки нет');
  await signInToDemo(page);
  await openSettings(page, 'Чаты');
  await page.getByRole('switch', { name: /^Отправлять по (Ctrl|⌘) \+ Enter$/ }).check();
  await expect(page.getByText(/Enter переносит строку, (Ctrl|⌘) \+ Enter отправляет/)).toBeVisible();

  await openRoom(page, /^Аня/);
  const field = page.getByRole('textbox', { name: 'Сообщение' });
  await field.fill('Первая строка');
  await field.press('Enter');
  await field.pressSequentially('вторая');
  await expect(field).toHaveValue('Первая строка\nвторая');
  await field.press('ControlOrMeta+Enter');
  await expect(field).toHaveValue('');
  await expect(page.getByRole('log').getByRole('article').filter({ hasText: 'вторая' })).toBeVisible();
});

test('«Реакции»: быстрая реакция — из шести или из всего каталога; её ставят двойное касание и кнопка у пузыря', async ({ page }, info) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openSettings(page, 'Реакции');
  const quick = page.getByRole('radiogroup', { name: 'Быстрая реакция' });
  await expect(quick.getByRole('radio', { name: '❤️' })).toHaveAttribute('aria-checked', 'true');
  await quick.getByRole('radio', { name: '👍' }).click();
  await expect(quick.getByRole('radio', { name: '👍' })).toHaveAttribute('aria-checked', 'true');

  await openRoom(page, /^Выходные/);
  const bubble = page.getByRole('log').getByRole('article').filter({ hasText: 'Кто что берёт на пикник?' });
  if (isPhone(info.project.name)) {
    // Двойное касание — пальцем: у мыши свои правила (двойной щелчок выделяет слово).
    // По координатам: `tap()` ждёт готовности элемента, и второе касание опаздывало бы за 300 мс.
    const text = bubble.getByText('Кто что берёт на пикник?');
    // В середину: у верха ленты пузырь закрыла бы плашка закреплённого.
    await text.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    // Дождаться, пока экран доедет (смена экранов — с движением): иначе координаты — на полпути.
    await text.click({ trial: true });
    const box = (await text.boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
  } else {
    // Кнопка у пузыря по наведению — в доступности она рядом со статьёй, а не в ней.
    await bubble.hover();
    await page.getByRole('log').getByRole('button', { name: 'Реакция 👍' }).first().click();
  }
  // Реакций в демо до этого ни у кого не было: «👍 1» — та, что поставили сейчас, и своя.
  await expect(page.getByRole('log').getByRole('list', { name: 'Реакции' }).getByRole('button', { name: '👍 1', pressed: true })).toBeVisible({ timeout: 10_000 });

  // Не из шести — из каталога: встаёт в ряд последней и подсвечена.
  await openSettings(page, 'Реакции');
  await page.getByRole('button', { name: 'Больше эмодзи' }).click();
  const panel = page.getByRole('dialog', { name: 'Больше эмодзи' });
  await panel.getByRole('button', { name: 'Еда и напитки' }).click();
  await panel.getByRole('menuitemcheckbox', { name: 'Реакция 🍕' }).click();
  await expect(panel).toBeHidden();
  await expect(quick.getByRole('radio', { name: '🍕' })).toHaveAttribute('aria-checked', 'true');
  expect(problems).toEqual([]);
});

test('«Папки»: подсказка — и вкладка над списком; своя папка из редактора; удалить — вкладки нет', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  // Папок нет — нет и полосы вкладок.
  await expect(page.getByRole('tablist', { name: 'Папки' })).toHaveCount(0);

  await openSettings(page, 'Папки');
  const suggestions = page.getByRole('list', { name: 'Можно начать с этих' });
  await suggestions.getByRole('listitem').filter({ hasText: 'Личные' }).getByRole('button', { name: 'Добавить' }).click();
  await expect(page.getByRole('button', { name: /^Личные\s*\d+$/ })).toBeVisible();

  // Своя: группы и вручную Аня.
  await page.getByRole('button', { name: 'Новая папка' }).click();
  const editor = page.getByRole('dialog', { name: 'Новая папка' });
  const done = editor.getByRole('button', { name: 'Готово' });
  await editor.getByRole('textbox', { name: 'Название' }).fill('Дача');
  await expect(done).toBeDisabled();
  await editor.getByRole('switch', { name: 'Группы' }).check();
  await editor.getByRole('list', { name: 'Всегда показывать' }).getByRole('button', { name: 'Добавить чаты' }).click();
  const chooser = page.getByRole('dialog', { name: 'Выберите чаты' });
  await chooser.getByRole('textbox', { name: 'Поиск' }).fill('аня');
  await chooser.getByRole('checkbox', { name: /Аня/ }).check();
  await chooser.getByRole('button', { name: 'Готово' }).click();
  await expect(editor.getByRole('list', { name: 'Всегда показывать' })).toContainText('Аня');
  await done.click();
  await expect(editor).toBeHidden();

  // Вкладки над списком: «Личные» — только личный чат; «Дача» — группы и Аня.
  const back = page.getByRole('button', { name: 'Назад' });
  await expect(async () => {
    if (!(await page.getByRole('tablist', { name: 'Папки' }).isVisible())) await back.click({ timeout: 1000 });
    await expect(page.getByRole('tablist', { name: 'Папки' })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  const tabs = page.getByRole('tablist', { name: 'Папки' });
  await expect(tabs.getByRole('tab')).toHaveText([/^Все/, /^Личные/, /^Дача/]);
  await tabs.getByRole('tab', { name: /^Личные/ }).click();
  await expect(page.getByRole('link', { name: /^Аня/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Выходные/ })).toHaveCount(0);
  await tabs.getByRole('tab', { name: /^Дача/ }).click();
  await expect(page.getByRole('link', { name: /^Выходные/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Аня/ })).toBeVisible();

  // Удалить — с вопросом; вкладка уходит, список снова весь.
  await openSettings(page, 'Папки');
  await page.getByRole('button', { name: /^Дача\s*\d+$/ }).click();
  await page.getByRole('dialog', { name: 'Папка' }).getByRole('button', { name: 'Удалить папку' }).click();
  await page.getByRole('dialog', { name: 'Удалить папку «Дача»?' }).getByRole('button', { name: 'Удалить папку' }).click();
  await expect(page.getByRole('button', { name: /^Дача\s*\d+$/ })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('«Об Iskra» — как в нативной: версия, сборка, устройство, ссылки; «Лицензии» — с текстами', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openSettings(page, 'Об Iskra');
  for (const label of ['Версия', 'Сборка', 'Устройство']) await expect(page.getByRole('listitem').filter({ hasText: label })).toBeVisible();
  await expect(page.getByRole('link', { name: /Исходный код/ })).toHaveAttribute('href', 'https://github.com/iskra-app/iskra-web');
  await expect(page.getByText(/GNU GPL версии 3/)).toBeVisible();

  await page.getByRole('link', { name: 'Лицензии' }).click();
  await expect(page.getByRole('heading', { name: 'Лицензии', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /^Iskra Web/ }).click();
  await expect(page.getByRole('dialog', { name: 'Iskra Web' })).toContainText('GNU GENERAL PUBLIC LICENSE');
  await page.getByRole('dialog', { name: 'Iskra Web' }).getByRole('button', { name: 'Готово' }).click();
  await page.getByRole('button', { name: /^matrix-js-sdk/ }).click();
  await expect(page.getByRole('dialog', { name: 'matrix-js-sdk' })).toContainText('Apache License');
  await page.keyboard.press('Escape');
  // «Назад» из лицензий — в «Об Iskra», а не в список разделов.
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByRole('heading', { name: 'Об Iskra', level: 1 })).toBeVisible();
  expect(problems).toEqual([]);
});
