import { expect, test, type Page } from '@playwright/test';
import { signInToDemo } from './helpers';

async function openNewChat(page: Page) {
  await page.getByRole('button', { name: 'Новый чат или комната' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Новый чат' })).toBeVisible();
  return dialog;
}

test('«Новый чат»: свои собеседники по буквам; поиск находит и их, и людей с сервера; адрес целиком — «Написать»', async ({ page }) => {
  await signInToDemo(page);
  const dialog = await openNewChat(page);
  // Три пути в комнату и собеседники под своей буквой. Сканера QR в вебе нет.
  for (const action of ['Создать комнату', 'Публичные комнаты', 'Присоединиться по адресу']) {
    await expect(dialog.getByRole('button', { name: action })).toBeVisible();
  }
  await expect(dialog.getByRole('button', { name: /QR/ })).toHaveCount(0);
  await expect(dialog.getByRole('region', { name: 'А' }).getByRole('button', { name: /^Аня/ })).toBeVisible();

  const search = dialog.getByRole('textbox', { name: 'Поиск по пользователям' });
  await search.fill('лен');
  // Лены нет ни в одном чате — её знает только каталог сервера.
  await expect(dialog.getByRole('region', { name: 'На сервере' }).getByRole('button', { name: /^Лена/ })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Ваши собеседники' })).toHaveCount(0);

  await search.fill('аня');
  await expect(dialog.getByRole('region', { name: 'Ваши собеседники' }).getByRole('button', { name: /^Аня/ })).toBeVisible();

  await search.fill('@nobody:demo.iskra.invalid');
  await expect(dialog.getByRole('button', { name: /Написать по этому адресу/ })).toBeVisible();

  await search.fill('лен');
  await dialog.getByRole('button', { name: /^Лена/ }).click();
  await expect(page.getByRole('heading', { name: 'Лена', level: 1 })).toBeVisible({ timeout: 10_000 });
});

test('«Публичные комнаты»: каталог страницами, закрытая — не нажимается; вход открывает комнату; Esc — к списку', async ({ page }) => {
  await signInToDemo(page);
  const dialog = await openNewChat(page);
  await dialog.getByRole('button', { name: 'Публичные комнаты' }).click();
  await expect(dialog.getByRole('heading', { name: 'Публичные комнаты' })).toBeVisible();
  // Каталог демо отдаёт по две комнаты: третья приходит следующей страницей.
  await expect(dialog.getByRole('button', { name: /^Совет дома/ })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /^Совет дома/ })).toContainText('Только по приглашению');

  // Esc на странице — назад к «Новому чату», а не закрыть окно.
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('heading', { name: 'Новый чат' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Публичные комнаты' }).click();

  await dialog.getByRole('textbox', { name: 'Поиск комнат' }).fill('поход');
  await expect(dialog.getByRole('button', { name: /^Гостиная/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: /^Походы/ }).click();
  await expect(page.getByRole('heading', { name: 'Походы', level: 1 })).toBeVisible({ timeout: 10_000 });
});

test('«Присоединиться по адресу»: не адрес — подсказка; #адрес:сервер — комната открывается', async ({ page }) => {
  await signInToDemo(page);
  const dialog = await openNewChat(page);
  await dialog.getByRole('button', { name: 'Присоединиться по адресу' }).click();
  const field = dialog.getByRole('textbox', { name: 'Присоединиться по адресу' });
  await field.fill('гостиная');
  await dialog.getByRole('button', { name: 'Войти' }).click();
  await expect(dialog.getByRole('alert')).toContainText('#название:сервер');
  await field.fill('#lounge:demo.iskra.invalid');
  await dialog.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: 'Гостиная', level: 1 })).toBeVisible({ timeout: 10_000 });
});
