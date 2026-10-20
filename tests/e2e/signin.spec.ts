import { expect, test } from '@playwright/test';
import { DEMO_ADDRESS, openApp, submitAddress, watchForProblems } from './helpers';

// Никаких слайдов до входа — сразу адрес, как в нативной Искре.
test('вход начинается с адреса: выбор сервера и «Что такое Matrix?» под полем', async ({ page }) => {
  const problems = watchForProblems(page);
  await openApp(page);
  await expect(page.getByRole('heading', { name: 'Где ваш аккаунт?' })).toBeVisible();
  const field = page.getByRole('textbox', { name: 'Адрес аккаунта' });
  // Поле пустое: сервер за человека не выбирается.
  await expect(field).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Далее' })).toBeDisabled();

  await page.getByRole('button', { name: 'Что такое Matrix?' }).click();
  const about = page.getByRole('dialog', { name: 'Что такое Matrix' });
  await expect(about.getByRole('heading', { name: 'Здесь никто не главный' })).toBeVisible();
  await about.getByRole('button', { name: 'Закрыть' }).click();
  await expect(about).toBeHidden();

  await page.getByRole('button', { name: 'Не знаете, какой сервер выбрать?' }).click();
  const servers = page.getByRole('dialog', { name: 'Выбор сервера' });
  // Браузер в тестах — русский, значит, и предупреждение о matrix.org.
  await expect(servers.getByText('Из России может быть недоступен')).toBeVisible();
  await expect(servers.getByRole('link', { name: /Свой сервер/ })).toHaveAttribute('target', '_blank');
  await servers.getByRole('button', { name: /^tchncs\.de/ }).click();
  await expect(servers).toBeHidden();
  // Выбор заполняет поле, но «Далее» — за человеком.
  await expect(field).toHaveValue('tchncs.de');
  await expect(page.getByRole('button', { name: 'Далее' })).toBeEnabled();
  expect(problems).toEqual([]);
});

test('сервер нашёлся — «Войти» и «Создать аккаунт» на том же месте, «Изменить» ведёт к адресу', async ({ page }) => {
  await openApp(page);
  await submitAddress(page, DEMO_ADDRESS);
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Создать аккаунт' })).toBeVisible();
  await expect(page.getByText(`Сервер: ${DEMO_ADDRESS}`)).toBeVisible();

  // Форма пароля — свой экран, и «Назад» возвращает к двум кнопкам.
  await page.getByRole('button', { name: 'У меня только логин и пароль' }).click();
  await expect(page.getByRole('heading', { name: `Вход на ${DEMO_ADDRESS}` })).toBeVisible();
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByRole('button', { name: 'Создать аккаунт' })).toBeVisible();

  await page.getByRole('button', { name: 'Изменить' }).click();
  await expect(page.getByRole('textbox', { name: 'Адрес аккаунта' })).toHaveValue(DEMO_ADDRESS);
});

test('внизу экрана входа — версия и сборка; не на web.iskra.wtf — пометка nightly и ссылка на стабильную', async ({ page }) => {
  await openApp(page);
  await expect(page.getByText(/^Версия \d{4}\.\d{2}\.\d{2} · сборка \w+$/)).toBeVisible();
  // Стабильная — только на своём адресе; тесты гоняют сборку на localhost, и это ночная.
  await expect(page.getByText('nightly', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Стабильная версия' })).toHaveAttribute('href', 'https://web.iskra.wtf/');
  // Сайт Искры — в любой сборке.
  await expect(page.getByRole('link', { name: 'iskra.wtf' })).toHaveAttribute('href', 'https://iskra.wtf');
});

test('тёмная тема: иконки в списке серверов — цветом текста, а не чёрные', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page);
  await page.getByRole('button', { name: 'Не знаете, какой сервер выбрать?' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('svg path').first()).toBeVisible();
  const fills = await dialog.locator('svg path').evaluateAll((paths) => paths.map((p) => getComputedStyle(p).fill));
  expect(fills.length).toBeGreaterThan(0);
  expect(fills.filter((f) => f === 'rgb(0, 0, 0)')).toEqual([]);
});
