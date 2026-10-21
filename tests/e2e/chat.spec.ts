import { expect, test, type Page } from '@playwright/test';
import { isPhone, signInToDemo, watchForProblems } from './helpers';

async function openRoom(page: Page, name: RegExp) {
  // На телефоне открытый чат занимает весь экран — сначала назад, к списку.
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('log')).toBeVisible();
}

const bubble = (page: Page, text: string) => page.getByRole('log').getByRole('article').filter({ hasText: text });

/** Меню сообщения — правым щелчком (пальцем это долгое нажатие, браузер шлёт тот же `contextmenu`). */
async function menuOf(page: Page, text: string) {
  await bubble(page, text).click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Ещё' });
  await expect(menu).toBeVisible();
  return menu;
}

test('меню сообщения: реакция ставится из меню и снимается нажатием на неё', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const menu = await menuOf(page, 'Я — пирог');
  // Точно: с датой и секундами — время у пузыря даёт только часы.
  await expect(menu).toContainText(/Отправлено .*\d{4}.*\d{1,2}:\d{2}:\d{2}/);
  // Чужое: ответить и скопировать — да; изменить и удалить — нет.
  await expect(menu.getByRole('menuitem', { name: 'Ответить' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Изменить' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Удалить' })).toHaveCount(0);
  await menu.getByRole('menuitemcheckbox', { name: 'Реакция 👍' }).click();
  await expect(menu).toBeHidden();

  const chip = page.getByRole('list', { name: 'Реакции' }).getByRole('button', { name: '👍, 1 человек' });
  await expect(chip).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  // Снять — нажать на свою же. Дождаться, пока она уйдёт на сервер: снимают её, а не эхо.
  await expect(page.getByRole('img', { name: 'Отправляется' })).toHaveCount(0);
  await chip.click();
  await expect(chip).toHaveCount(0, { timeout: 10_000 });
  expect(problems).toEqual([]);
});

test('ответ и правка: полоса над полем, ↑ берёт последнее своё, Esc отменяет', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const field = page.getByRole('textbox', { name: 'Сообщение' });

  await (await menuOf(page, 'Я — пирог')).getByRole('menuitem', { name: 'Ответить' }).click();
  await expect(page.getByText('Ответ', { exact: true })).toBeVisible();
  await expect(field).toBeFocused();
  await field.press('Escape');
  await expect(page.getByText('Ответ', { exact: true })).toBeHidden();

  await (await menuOf(page, 'Я — пирог')).getByRole('menuitem', { name: 'Ответить' }).click();
  await field.fill('А я — мангал');
  await page.getByRole('button', { name: 'Отправить' }).click();
  const reply = bubble(page, 'А я — мангал');
  // Цитата — внутри ответа: кто и что.
  await expect(reply).toContainText('Вера');
  await expect(reply).toContainText('Я — пирог');
  await expect(page.getByText('Ответ', { exact: true })).toBeHidden();
  await expect(page.getByRole('img', { name: 'Отправляется' })).toHaveCount(0, { timeout: 10_000 });

  // ↑ в пустом поле — правка последнего своего.
  await field.click();
  await field.press('ArrowUp');
  await expect(page.getByText('Изменение сообщения')).toBeVisible();
  await expect(field).toHaveValue('А я — мангал');
  await field.fill('А я — мангал и угли');
  await page.getByRole('button', { name: 'Отправить' }).click();
  // «изменено» — рядом с пузырём, в колонке отметок, как в нативной Искре.
  await expect(page.getByRole('log').locator('.row').filter({ hasText: 'А я — мангал и угли' })).toContainText('изменено', { timeout: 10_000 });
  await expect(field).toHaveValue('');
});

test('удаление своего — с вопросом, и исчезает у всех', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const field = page.getByRole('textbox', { name: 'Сообщение' });
  await field.fill('Ой, не в тот чат');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByRole('img', { name: 'Отправляется' })).toHaveCount(0, { timeout: 10_000 });

  await (await menuOf(page, 'Ой, не в тот чат')).getByRole('menuitem', { name: 'Удалить' }).click();
  const dialog = page.getByRole('dialog', { name: 'Удалить сообщение?' });
  await expect(dialog).toContainText('исчезнет у всех');
  await dialog.getByRole('button', { name: 'Удалить' }).click();
  await expect(bubble(page, 'Ой, не в тот чат')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole('log')).toContainText('Сообщение удалено');
});

test('опрос: голос Веры уже есть, мой добавляется — и видны итоги', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const poll = bubble(page, 'Куда едем?');
  // До своего голоса итогов не видно — только сколько проголосовало.
  await expect(poll).toContainText('1 голос');
  await expect(poll).not.toContainText('%');
  await poll.getByRole('radio', { name: /^В лес/ }).click();
  await expect(poll.getByRole('radio', { name: /^В лес/ })).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
  await expect(poll).toContainText('2 голоса');
  await expect(poll.getByRole('radio', { name: /^На озеро/ })).toContainText('50');

  // «Отменить голос» — пустой ответ; итоги снова прячутся.
  await (await menuOf(page, 'Куда едем?')).getByRole('menuitem', { name: 'Отменить голос' }).click();
  await expect(poll.getByRole('radio', { name: /^В лес/ })).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 });
  await expect(poll).toContainText('1 голос');
  // Опрос не свой — закрыть его нельзя.
  await expect((await menuOf(page, 'Куда едем?')).getByRole('menuitem', { name: 'Завершить опрос' })).toHaveCount(0);
});

test('свой опрос: создать из скрепки, проголосовать, завершить — с вопросом', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  await page.getByRole('button', { name: 'Добавить фото или файл' }).click();
  await page.getByRole('menuitem', { name: 'Опрос' }).click();
  const dialog = page.getByRole('dialog', { name: 'Новый опрос' });
  const send = dialog.getByRole('button', { name: 'Отправить' });
  await dialog.getByRole('textbox', { name: 'Вопрос' }).fill('Во сколько встречаемся?');
  await dialog.getByRole('textbox', { name: 'Вариант 1' }).fill('В девять');
  await expect(send).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Вариант 2' }).fill('В десять');
  // Набрали в последний — появился следующий, пустой.
  await expect(dialog.getByRole('textbox', { name: 'Вариант 3' })).toHaveValue('');
  await send.click();
  await expect(dialog).toBeHidden();

  const poll = bubble(page, 'Во сколько встречаемся?');
  await expect(poll).toContainText('Пока никто не голосовал');
  await poll.getByRole('radio', { name: /^В десять/ }).click();
  await expect(poll.getByRole('radio', { name: /^В десять/ })).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
  await expect(poll.getByRole('radio', { name: /^В десять/ })).toContainText('100');

  await (await menuOf(page, 'Во сколько встречаемся?')).getByRole('menuitem', { name: 'Завершить опрос' }).click();
  const confirm = page.getByRole('dialog', { name: 'Завершить опрос?' });
  await expect(confirm).toContainText('Голосовать больше будет нельзя');
  await confirm.getByRole('button', { name: 'Завершить опрос' }).click();
  await expect(poll).toContainText('Опрос завершён', { timeout: 10_000 });
  await expect(poll.getByRole('radio', { name: /^В девять/ })).toBeDisabled();
  expect(problems).toEqual([]);
});

test('в личном чате опроса в скрепке нет', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  await page.getByRole('button', { name: 'Добавить фото или файл' }).click();
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Опрос' })).toHaveCount(0);
});

test('закреплённое: полоса над лентой ведёт к сообщению, шеврон — к списку «Закреплённые»', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const strip = page.getByRole('button', { name: 'Перейти к закреплённому' });
  await expect(strip).toContainText('Кто что берёт на пикник?');
  await page.getByRole('log').evaluate((log) => log.parentElement!.scrollTo({ top: 0 }));
  await strip.click();
  await expect(bubble(page, 'Кто что берёт на пикник?')).toBeInViewport();
  // Алиса здесь не админ: открепить нельзя ни из полосы, ни из меню.
  await expect(page.getByRole('button', { name: 'Открепить' })).toHaveCount(0);
  const menu = await menuOf(page, 'Кто что берёт на пикник?');
  await expect(menu.getByRole('menuitem', { name: /Закрепить|Открепить/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Список — из шеврона; оттуда тоже к сообщению.
  await page.getByRole('log').evaluate((log) => log.parentElement!.scrollTo({ top: 0 }));
  await page.getByRole('button', { name: 'Закреплённые' }).click();
  const list = page.getByRole('dialog', { name: 'Закреплённые' });
  await expect(list).toContainText('Борис');
  await expect(list.getByRole('button', { name: 'Открепить' })).toHaveCount(0);
  await list.getByRole('button', { name: /Кто что берёт на пикник/ }).click();
  await expect(list).toBeHidden();
  await expect(bubble(page, 'Кто что берёт на пикник?')).toBeInViewport();
});

test('шапка чата, как в нативной: под именем — «печатает…», потом число участников; в личном — когда был собеседник', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const subtitle = page.locator('.main-column header .subtitle');
  await expect(subtitle).toHaveText('3 участника');
  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Кто за рулём?');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(subtitle).toHaveText('Вера печатает…', { timeout: 10_000 });
  await expect(subtitle).toHaveText('3 участника', { timeout: 15_000 });

  // Присутствие из демо: Аня была пять минут назад. Сервер, который молчит, — ID собеседника.
  await openRoom(page, /^Аня/);
  await expect(subtitle).toHaveText('был(а) 5 мин назад');
});

test('HTML сообщения: разметка на месте, скрипта нет, картинка — подписью; под CSP без ошибок', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Дом 14/);
  const agenda = bubble(page, 'Повестка');
  await expect(agenda.locator('b')).toHaveText('Повестка');
  await expect(agenda.getByRole('listitem')).toHaveText(['лифт', 'двор']);
  await expect(agenda.getByRole('link', { name: 'полностью здесь' })).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(agenda).toContainText('[схема двора]');
  await expect(agenda.locator('script, img')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('черновик переживает переход в другой чат и перезагрузку', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const field = page.getByRole('textbox', { name: 'Сообщение' });
  await field.fill('Недописанная мысль');
  await openRoom(page, /^Дом 14/);
  await expect(field).toHaveValue('');
  await openRoom(page, /^Выходные/);
  await expect(field).toHaveValue('Недописанная мысль');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: 'Сообщение' })).toHaveValue('Недописанная мысль', { timeout: 20_000 });
});

test('мышь: панель по наведению; справка по клавишам — по «?»', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'наведение и клавиатура — десктоп');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const pie = bubble(page, 'Я — пирог');
  await pie.hover();
  // Панель — рядом с пузырём, у каждого сообщения своя.
  await pie.locator('..').getByRole('button', { name: 'Ответить' }).click();
  await expect(page.getByText('Ответ', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Сообщение' }).press('Escape');

  await page.getByRole('log').click();
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Сочетания клавиш' });
  await expect(help).toContainText('Поиск по сообщениям');
  await expect(help).toContainText('изменить последнее своё');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();

  // `Esc`, когда закрывать нечего: чат закрывается, как в нативной на Mac.
  await openRoom(page, /^Длинная история/);
  await page.getByRole('log').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('log')).toHaveCount(0);
  await expect(page).not.toHaveURL(/#\/room\//);
});

test('телефон: меню листом снизу', async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), 'лист — для пальца');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const menu = await menuOf(page, 'Я — пирог');
  const box = (await menu.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y + box.height).toBeGreaterThan(viewport.height - 40);
  expect(box.width).toBeGreaterThan(viewport.width - 40);
});

test('телефон: долгое нажатие открывает меню и там, где браузер не шлёт contextmenu (iOS)', async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), 'касание');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const pie = bubble(page, 'Я — пирог');
  const box = (await pie.boundingBox())!;
  const at = { clientX: box.x + 10, clientY: box.y + 10, pointerId: 7, pointerType: 'touch', isPrimary: true };
  // Только касание, без `contextmenu`: так ведёт себя Safari на iPhone и iPad.
  await pie.dispatchEvent('pointerdown', at);
  const menu = page.getByRole('menu', { name: 'Ещё' });
  await expect(menu).toBeVisible();
  await pie.dispatchEvent('pointerup', at);
  // А Android шлёт `contextmenu` следом — второго меню (и закрытия первого) это не вызывает.
  await pie.dispatchEvent('contextmenu', { clientX: at.clientX, clientY: at.clientY });
  await expect(menu).toBeVisible();
  await expect(page.getByRole('menu')).toHaveCount(1);
});

test('геопозиция: из меню скрепки, с честной точностью в вопросе — и карточкой в ленте', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 55.755831, longitude: 37.617673, accuracy: 1200 });
  await signInToDemo(page);
  await openRoom(page, /^Аня/);

  await page.getByRole('button', { name: 'Добавить фото или файл' }).click();
  const menu = page.getByRole('menu', { name: 'Добавить фото или файл' });
  await expect(menu.getByRole('menuitem')).toHaveText(['Фото или видео', 'Файл', 'Геопозиция']);
  await menu.getByRole('menuitem', { name: 'Геопозиция' }).click();

  const dialog = page.getByRole('dialog', { name: 'Отправить, где вы сейчас?' });
  await expect(dialog).toContainText('около 1,2 км');
  await dialog.getByRole('button', { name: 'Отправить' }).click();

  const card = page.getByRole('log').getByRole('article').filter({ hasText: 'Геопозиция' }).last();
  await expect(card).toContainText('55,75583');
  await expect(card).toContainText('± 1,2 км');
  await expect(card.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute('href', /mlat=55\.755831&mlon=37\.617673/);
  await expect(page.getByRole('img', { name: 'Отправляется' })).toHaveCount(0, { timeout: 10_000 });
});

test('отметки — рядом с пузырём: «глаз» у самого нового прочитанного своего, галочка — у ещё не прочитанного', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  const log = page.getByRole('log');
  // Аня ответила после «Поеду!» — значит, прочитала его и всё выше; «глаз» — только у него.
  await expect(log.getByRole('img', { name: 'Прочитано' })).toHaveCount(1);
  const read = log.locator('.row').filter({ hasText: 'Поеду! Во сколько?' });
  await expect(read.getByRole('img', { name: 'Прочитано' })).toBeVisible();
  // Время — не в пузыре.
  await expect(bubble(page, 'Поеду! Во сколько?').locator('time')).toHaveCount(0);
  // Скринридеру сообщение говорит, чьё оно: в личном чате имени на экране нет.
  expect(await bubble(page, 'Поеду! Во сколько?').ariaSnapshot()).toContain('Вы:');
  expect(await bubble(page, 'Возьми плед, там ветрено').ariaSnapshot()).toContain('Аня:');

  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Беру термос');
  await page.getByRole('button', { name: 'Отправить' }).click();
  const mine = log.locator('.row').filter({ hasText: 'Беру термос' });
  await expect(mine.getByRole('img', { name: 'Отправлено' })).toBeVisible({ timeout: 10_000 });
});

test('«Выбрать»: несколько сообщений — скопировать стенограммой, удалить пачкой; Esc — выйти', async ({ page, context }, info) => {
  const problems = watchForProblems(page);
  if (info.project.name.startsWith('chromium')) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const field = page.getByRole('textbox', { name: 'Сообщение' });
  for (const text of ['Первое лишнее', 'Второе лишнее']) {
    await field.fill(text);
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(bubble(page, text)).toHaveCount(1);
  }
  await expect(page.getByRole('img', { name: 'Отправляется' })).toHaveCount(0, { timeout: 10_000 });

  await (await menuOf(page, 'Первое лишнее')).getByRole('menuitem', { name: 'Выбрать' }).click();
  const bar = page.getByRole('toolbar', { name: 'Выбрано: 1' });
  await expect(bar).toBeVisible();
  // Композера на время выбора нет — на его месте панель.
  await expect(field).toHaveCount(0);
  await page.getByRole('checkbox', { name: /Второе лишнее/ }).click();
  await expect(page.getByRole('toolbar', { name: 'Выбрано: 2' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Второе лишнее/ })).toHaveAttribute('aria-checked', 'true');

  if (info.project.name.startsWith('chromium')) {
    await page.getByRole('button', { name: 'Скопировать' }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('Первое лишнее');
    expect(copied).toContain('\n\n');
    await expect(page.getByRole('textbox', { name: 'Сообщение' })).toBeVisible();
    await (await menuOf(page, 'Первое лишнее')).getByRole('menuitem', { name: 'Выбрать' }).click();
    await page.getByRole('checkbox', { name: /Второе лишнее/ }).click();
  }

  // Чужое среди выбранного — удалять нельзя: удаление не промолчит о пропущенном.
  await page.getByRole('checkbox', { name: /Алиса, ты с нами/ }).click();
  await expect(page.getByRole('button', { name: 'Удалить' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Алиса, ты с нами/ }).click();

  await page.getByRole('button', { name: 'Удалить' }).click();
  const dialog = page.getByRole('dialog', { name: 'Удалить выбранные сообщения?' });
  await dialog.getByRole('button', { name: 'Удалить' }).click();
  await expect(bubble(page, 'Первое лишнее')).toHaveCount(0, { timeout: 10_000 });
  await expect(bubble(page, 'Второе лишнее')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Сообщение' })).toBeVisible();

  await (await menuOf(page, 'Алиса, ты с нами?')).getByRole('menuitem', { name: 'Выбрать' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('«Переслать»: текст и файл в другой чат — с пометкой; из выбора — несколько и с комментарием', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);

  await (await menuOf(page, 'Алиса, ты с нами?')).getByRole('menuitem', { name: 'Переслать' }).click();
  let dialog = page.getByRole('dialog', { name: 'Переслать в…' });
  const send = dialog.getByRole('button', { name: 'Отправить' });
  await expect(send).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Поиск чата' }).fill('ан');
  await dialog.getByRole('checkbox', { name: /Аня/ }).click();
  await send.click();
  await expect(dialog).toBeHidden();

  // Из выбора: файл и прогноз, с комментарием.
  await (await menuOf(page, 'Что взять.txt')).getByRole('menuitem', { name: 'Выбрать' }).click();
  await page.getByRole('checkbox', { name: /Прогноз на субботу/ }).click();
  await page.getByRole('button', { name: 'Переслать' }).click();
  dialog = page.getByRole('dialog', { name: 'Переслать в…' });
  await dialog.getByRole('checkbox', { name: /Аня/ }).click();
  await dialog.getByRole('textbox', { name: 'Добавить комментарий…' }).fill('Смотри, что у нас');
  await dialog.getByRole('button', { name: 'Отправить' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('toolbar')).toHaveCount(0);

  await openRoom(page, /^Аня/);
  const log = page.getByRole('log');
  await expect(bubble(page, 'Алиса, ты с нами?')).toContainText('Пересланное сообщение', { timeout: 10_000 });
  await expect(log.getByText('Что взять.txt')).toBeVisible({ timeout: 15_000 });
  await expect(bubble(page, 'Прогноз на субботу')).toContainText('Пересланное сообщение');
  await expect(bubble(page, 'Смотри, что у нас')).not.toContainText('Пересланное сообщение');
  expect(problems).toEqual([]);
});

test('«Больше эмодзи»: панель с разделами, реакция из неё — и она в «Недавних»', async ({ page }, info) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  let menu = await menuOf(page, 'Я — пирог');
  await menu.getByRole('menuitem', { name: 'Больше эмодзи' }).click();
  // Колёсико листает панель, а не закрывает меню. Колёсико — у мыши: в мобильном WebKit
  // Playwright его и не умеет.
  if (!isPhone(info.project.name)) {
    await menu.getByRole('menuitemcheckbox', { name: 'Реакция 😀' }).hover();
    await page.mouse.wheel(0, 400);
    await expect(menu).toBeVisible();
  }
  await menu.getByRole('button', { name: 'Еда и напитки' }).click();
  await menu.getByRole('menuitemcheckbox', { name: 'Реакция 🍕' }).click();
  await expect(menu).toBeHidden();
  await expect(page.getByRole('list', { name: 'Реакции' }).getByRole('button', { name: '🍕, 1 человек' })).toBeVisible({ timeout: 10_000 });

  menu = await menuOf(page, 'Я — пирог');
  await menu.getByRole('menuitem', { name: 'Больше эмодзи' }).click();
  // Своя — подсвечена и снимается; в недавних — первой.
  const recent = menu.getByRole('heading', { name: 'Недавние' });
  await expect(recent).toBeVisible();
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Убрать свою реакцию' }).first()).toHaveText('🍕');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  expect(problems).toEqual([]);
});

test('лента с клавиатуры: одна остановка Tab, стрелки по сообщениям, Enter — меню', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'клавиатура — путь десктопа');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const log = page.getByRole('log');
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('role') + ':' + (document.activeElement?.textContent ?? '').trim().slice(0, 40));

  // Из поля назад — через кнопки последнего сообщения к нему самому.
  await page.getByRole('textbox', { name: 'Сообщение' }).focus();
  for (let i = 0; i < 8 && !(await focused()).startsWith('article'); i++) await page.keyboard.press('Shift+Tab');
  expect(await focused()).toMatch(/^article:.*Алиса, ты с нами/);
  // Ещё Shift Tab — и лента позади: других остановок в ней нет.
  await page.keyboard.press('Shift+Tab');
  expect(await log.evaluate((el) => el.contains(document.activeElement))).toBe(false);

  await page.keyboard.press('Tab');
  expect(await focused()).toMatch(/^article:.*Алиса, ты с нами/);
  // Выше — стикер Бориса, ещё выше — прогноз.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await focused()).toMatch(/^article:.*Прогноз на субботу/);
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Ещё' });
  await expect(menu.getByRole('menuitem', { name: 'Ответить' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  // Меню закрылось — фокус там, откуда его открыли.
  expect(await focused()).toMatch(/^article:.*Прогноз на субботу/);
  await page.keyboard.press('Home');
  expect(await focused()).toMatch(/^article:/);
  expect(await focused()).not.toMatch(/Прогноз/);
});

test('плавающая дата: пока листают — день того, что наверху; остановились — гаснет', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'колесо — десктоп');
  await signInToDemo(page);
  await openRoom(page, /^Длинная история/);
  await expect(bubble(page, 'Сообщение номер 400')).toBeInViewport();
  const floating = page.locator('.floating');
  await expect(floating).toHaveCount(0);
  await page.getByRole('log').hover();
  await page.mouse.wheel(0, -600);
  await expect(page.locator('.floating.shown')).toBeVisible();
  await expect(floating).not.toBeEmpty();
  await expect(page.locator('.floating.shown')).toHaveCount(0, { timeout: 3000 });
});

test('заблокировали собеседника — вместо поля «Вы заблокировали…» и «Разблокировать»', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  await page.getByRole('button', { name: 'О чате' }).click();
  await page.getByRole('button', { name: 'Заблокировать пользователя' }).click();
  await page.getByRole('button', { name: 'Закрыть' }).first().click().catch(() => {});
  const banner = page.getByRole('status').filter({ hasText: 'Вы заблокировали этого пользователя' });
  await expect(banner).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Сообщение' })).toHaveCount(0);
  await banner.getByRole('button', { name: 'Разблокировать' }).click();
  await expect(page.getByRole('textbox', { name: 'Сообщение' })).toBeVisible();
});

test('полоса «новые ключи»: собеседник сменил ключи — сказано над лентой; «Понятно» убирает её насовсем', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  const banner = page.getByRole('status').filter({ hasText: 'Аня: новые ключи шифрования' });
  await expect(banner).toHaveCount(0);
  // В демо Аня «входит с нового телефона» в ответ на первое сообщение ей.
  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Ты тут?');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(banner).toContainText('после входа на новом телефоне');
  // Пока не ответили — вопрос остаётся и после перезагрузки: его помнит крипто, а не экран.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await banner.getByRole('button', { name: 'Понятно' }).click();
  await expect(banner).toHaveCount(0);
  // Новые ключи запомнены как ожидаемые: после перезагрузки полоса не возвращается.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('log').getByRole('article').filter({ hasText: 'Возьми плед' })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_000);
  await expect(banner).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('меню сообщения: «N реакций» — кто что поставил; «Пожаловаться» — модераторам, с причиной по желанию', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const lake = page.getByRole('log').getByRole('article').filter({ hasText: 'Озеро прошлым летом' });
  await lake.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Ещё' });
  await menu.getByRole('menuitem', { name: '1 реакция' }).click();
  const reactors = page.getByRole('dialog', { name: '1 реакция' });
  await expect(reactors.getByRole('radio', { name: 'Все · 1' })).toBeChecked();
  await expect(reactors.getByRole('listitem')).toHaveText([/Борис.*🔥/]);
  await page.keyboard.press('Escape');
  await expect(reactors).toBeHidden();

  // Своё — не жалуются; чужое — да.
  const menuOf = async (text: string) => {
    await page.getByRole('log').getByRole('article').filter({ hasText: text }).click({ button: 'right' });
    await expect(menu).toBeVisible();
  };
  await menuOf('Я — пирог');
  await menu.getByRole('menuitem', { name: 'Пожаловаться' }).click();
  const report = page.getByRole('dialog', { name: 'Пожаловаться на сообщение' });
  await report.getByRole('textbox').fill('Спам');
  await report.getByRole('button', { name: 'Отправить' }).click();
  await expect(report).toBeHidden();
  await page.waitForTimeout(300);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(problems).toEqual([]);
});
