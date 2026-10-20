import { expect, test } from '@playwright/test';
import { signInToDemo } from './helpers';

const lena = '@lena:demo.iskra.invalid';
const lounge = '#lounge:demo.iskra.invalid';

test('ссылка s.iskra.wtf: человеку — «Написать», в комнату — «Войти», в свою комнату — сразу', async ({ page }) => {
  await signInToDemo(page);

  await page.evaluate((hash) => (window.location.hash = hash), `#/open/${encodeURIComponent(lena)}`);
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Написать Лена?' })).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toContainText(lena);
  await dialog.getByRole('button', { name: 'Написать' }).click();
  await expect(page.getByRole('heading', { name: 'Лена', level: 1 })).toBeVisible({ timeout: 10_000 });
  // Отработавшая ссылка не остаётся в адресе: «назад» не спросит снова.
  expect(page.url()).toContain('#/room/');

  await page.evaluate((hash) => (window.location.hash = hash), `#/open/${encodeURIComponent(lounge)}`);
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: `Вступить в ${lounge}?` })).toBeVisible();
  await dialog.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: 'Гостиная', level: 1 })).toBeVisible({ timeout: 10_000 });

  // Уже состоим — без вопроса.
  await page.evaluate(() => (window.location.hash = '#/'));
  await page.evaluate((hash) => (window.location.hash = hash), `#/open/${encodeURIComponent(lounge)}`);
  await expect(page.getByRole('heading', { name: 'Гостиная', level: 1 })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('ссылка до входа ждёт входа, даже если вход вернул на корень; «Отмена» — к списку', async ({ page }) => {
  await page.goto(`/#/open/${encodeURIComponent(lena)}`, { waitUntil: 'domcontentloaded' });
  // `signInToDemo` открывает `/` — как возврат со страницы входа: адреса нет, ссылка ждёт.
  await signInToDemo(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Написать Лена?' })).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('#/');
});
