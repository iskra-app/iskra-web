import { expect, test } from '@playwright/test';
import { isPhone, signInToDemo, watchForProblems } from './helpers';

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
