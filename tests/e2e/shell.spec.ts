import { expect, test } from '@playwright/test';
import { isPhone, openRoom, signInToDemo, watchForProblems } from './helpers';

test('адрес чата открывает чат; на телефоне — вместо списка, на десктопе — рядом', async ({ page }, info) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await page.goto('/#/room/' + encodeURIComponent('!abc:example.org'));
  await expect(page.getByRole('heading', { name: '!abc:example.org' })).toBeVisible();
  const list = page.getByRole('heading', { name: 'Чаты', level: 1 });
  if (isPhone(info.project.name)) {
    await expect(list).toBeHidden();
    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(list).toBeVisible();
    await expect(page).toHaveURL(/#\/$/);
  } else {
    await expect(list).toBeVisible();
  }
  expect(problems).toEqual([]);
});

test('шапки колонок одной высоты: списка чатов, чата с подписью и «О чате»', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('phone'), 'колонки рядом — только на широком экране');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  await page.getByRole('button', { name: 'О чате' }).click();
  const bars = page.locator('header[data-titlebar]');
  await expect(bars).toHaveCount(3);
  // Панель ещё открывается: мерить, когда встала.
  await expect
    .poll(async () => new Set(await bars.evaluateAll((all) => all.map((bar) => bar.getBoundingClientRect().height))).size)
    .toBe(1);
});

test('правая панель на широком экране сдвигает чат, а не перекрывает его', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'только десктоп');
  await signInToDemo(page);
  await page.goto('/#/room/' + encodeURIComponent('!abc:example.org'));
  const chat = page.locator('section.main');
  const before = (await chat.boundingBox())!.width;
  await page.getByRole('button', { name: 'О чате' }).click();
  await expect(page.locator('aside.panel')).toBeVisible();
  await expect(page.locator('.scrim')).toHaveCount(0);
  const after = (await chat.boundingBox())!.width;
  expect(after).toBeLessThan(before);
});

test('имя и подпись в шапке чата открывают «О чате» и закрывают её', async ({ page }) => {
  await signInToDemo(page);
  await page.getByRole('link', { name: /^Выходные/ }).click();
  await expect(page.getByRole('heading', { name: 'Выходные', level: 1 })).toBeVisible();
  // Кнопка поверх имени — для пальца и мыши; скринридеру хватает ⓘ.
  const title = page.locator('.main-column .title-press');
  await title.click();
  await expect(page.locator('aside.panel')).toBeVisible();
  const info = page.getByRole('button', { name: 'О чате', includeHidden: true });
  await expect(info).toHaveAttribute('aria-pressed', 'true');
  await page.locator('aside.panel').getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByRole('button', { name: 'О чате' })).toHaveAttribute('aria-pressed', 'false');
});

test('телефон: системное «назад» закрывает просмотрщик и «О чате» раньше чата', async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), 'только телефон');
  await signInToDemo(page);
  await page.getByRole('link', { name: /^Выходные/ }).click();
  await page.getByRole('log').getByRole('button', { name: 'Фото' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Фото' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Фото' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Выходные' })).toBeVisible();
  await page.getByRole('button', { name: 'О чате' }).click();
  const panel = page.locator('aside.panel');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Пригласить' }).click();
  const invite = page.getByRole('dialog', { name: 'Пригласить', exact: true });
  await expect(invite).toBeVisible();
  await page.goBack();
  await expect(invite).toBeHidden();
  await expect(panel).toBeVisible();
  await page.goBack();
  await expect(panel).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Выходные' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Чаты', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: /^Аня/ }).click();
  await expect(page.getByRole('heading', { name: /^Аня/, level: 1 })).toBeVisible();
  await expect(page.locator('aside.panel')).toBeHidden();
});

test('десктоп: панель показывает выбранный чат и Esc возвращает фокус', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'только десктоп');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const infoButton = page.getByRole('button', { name: 'О чате' });
  await infoButton.click();
  const panel = page.locator('aside.panel');
  await expect(panel).toContainText('Выходные');
  await openRoom(page, /^Аня/);
  await expect(panel).toContainText('Аня');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(infoButton).toBeFocused();
  await expect(page.getByRole('heading', { name: /^Аня/ })).toBeVisible();
});

test('уменьшенное движение и единый текст сообщений', async ({ page }) => {
  await signInToDemo(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoom(page, /^Выходные/);
  const conversation = page.locator('.conversation');
  await expect(conversation).toHaveCSS('animation-name', 'none');
  await expect(conversation.locator('.bubble').first()).toHaveCSS('font-size', '14px');
  await expect(page.locator('.main-column header h1')).toHaveCSS('font-size', '15px');
});

test('телефон: видимая область с клавиатурой вмещает композер', async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), 'только телефон');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const composer = page.getByRole('textbox', { name: 'Сообщение' });
  await composer.fill('Длинный черновик\n'.repeat(30));
  const height = await page.evaluate(() => {
    const viewport = window.visualViewport!;
    const height = window.innerHeight - 300;
    Object.defineProperty(viewport, 'height', { value: height });
    viewport.dispatchEvent(new Event('resize'));
    return height;
  });
  await expect(page.locator('#app')).toHaveCSS('height', `${height}px`);
  await expect.poll(async () => (await composer.boundingBox())!.height).toBeLessThanOrEqual(height * 0.4 + 1);
  await composer.blur();
  await expect(page.locator('html')).not.toHaveAttribute('data-keyboard-viewport');
});

test('ширину списка можно менять с клавиатуры, и она запоминается', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'только десктоп');
  await signInToDemo(page);
  const separator = page.getByRole('separator', { name: 'Ширина списка чатов' });
  await separator.focus();
  await page.keyboard.press('End');
  await expect(separator).toHaveAttribute('aria-valuenow', '25');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '25');
  await page.getByRole('separator').dblclick();
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '20');
});

test('манифест устанавливаемого приложения на месте', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.launch_handler).toEqual({ client_mode: 'focus-existing' });
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
});

test('окно, закрываясь, не перекладывает содержимое в ряд, пока догорает', async ({ page }) => {
  await signInToDemo(page);
  await page.getByRole('button', { name: 'Новый чат или комната' }).click();
  const dialog = page.getByRole('dialog', { name: 'Новый чат' });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(500);
  // Закрыть — и в следующем кадре, пока окно ещё на экране, посмотреть, как оно разложено.
  const during = await page.evaluate(async () => {
    const element = document.querySelector('dialog[open]') as HTMLDialogElement;
    element.close();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    const style = getComputedStyle(element);
    return { display: style.display, direction: style.flexDirection };
  });
  expect(during.display === 'none' || during.direction === 'column', JSON.stringify(during)).toBe(true);
});

test('на широком мониторе — во всю ширину, без полей по бокам', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'только десктоп');
  await page.setViewportSize({ width: 2560, height: 1080 });
  await signInToDemo(page);
  const box = (await page.locator('.columns').boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(2560);
});
