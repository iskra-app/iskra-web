import { expect, test } from '@playwright/test';
import { consoleOf, openRoom, signInToDemo, watchForProblems } from './helpers';

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) console.log(`Консоль «${info.title}»:\n${consoleOf(page).slice(-40).join('\n')}`);
});

test('стикеры: панель у поля, отправка, недавние, «Добавить в мои стикеры» и настройки', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);

  // Чужой стикер — без пузыря, картинкой.
  const log = page.getByRole('log');
  await expect(log.getByRole('img', { name: '🔓' })).toBeVisible();

  await page.getByRole('button', { name: 'Стикеры' }).click();
  const panel = page.getByRole('menu', { name: 'Стикеры' });
  await expect(panel.getByRole('heading', { name: 'Мои стикеры' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Искра' })).toBeVisible();
  // «Искорки» загружаются в аккаунт при первом открытии — последними.
  await expect(panel.getByRole('heading', { name: 'Искорки' })).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByRole('button', { name: 'Добавить себе' })).toBeVisible();

  // 🔓 есть и в «Искре», и в «Искорках» — первый, из набора чата.
  await panel.getByRole('menuitem', { name: '🔓' }).first().click();
  await expect(panel).toBeHidden();
  await expect(log.getByRole('article').last().getByRole('img', { name: '🔓' })).toBeVisible();

  // Отправленный — первым в «Недавних».
  await page.getByRole('button', { name: 'Стикеры' }).click();
  await expect(panel.getByRole('heading', { name: 'Недавние' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  // Стикер Бориса — себе.
  await log.getByRole('img', { name: '🔓' }).first().click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Ещё' });
  await menu.getByRole('menuitem', { name: 'Добавить в мои стикеры' }).click();
  await log.getByRole('img', { name: '🔓' }).first().click({ button: 'right' });
  await expect(menu.getByRole('menuitem', { name: 'Убрать из моих стикеров' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto(page.url().replace(/#.*$/, '#/settings/reactions'));
  await expect(page.getByRole('heading', { name: 'Стикеры и реакции' }).first()).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Искорки' })).toBeChecked();
  await expect(page.getByRole('group', { name: 'Мои стикеры' }).getByRole('button')).toHaveCount(5);
  await page.getByRole('button', { name: 'Очистить недавние' }).click();
  await expect(page.getByRole('button', { name: 'Очистить недавние' })).toBeDisabled();
  expect(problems).toEqual([]);
});

test('стикер в зашифрованный чат уходит зашифрованной картинкой и рисуется стикером', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  await page.getByRole('button', { name: 'Стикеры' }).click();
  const panel = page.getByRole('menu', { name: 'Стикеры' });
  await panel.getByRole('menuitem', { name: '👋' }).first().click();
  const sent = page.getByRole('log').getByRole('article').last();
  await expect(sent.getByRole('img', { name: 'Стикер' })).toBeVisible({ timeout: 15_000 });
  // Не фото: просмотрщик стикер не открывает, и кнопки «Фото» у него нет.
  await expect(sent.getByRole('button', { name: 'Фото' })).toHaveCount(0);
});
