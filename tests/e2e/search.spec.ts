import { expect, test } from '@playwright/test';
import { consoleOf, openRoom, signInToDemo, watchForProblems } from './helpers';

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) console.log(`Консоль «${info.title}»:\n${consoleOf(page).slice(-40).join('\n')}`);
});

test('поиск по сообщениям: над списком — найденное, нажатие открывает чат на сообщении', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);

  const field = page.getByRole('searchbox', { name: 'Поиск по сообщениям' });
  // Слово, которого нет нигде, — «Ничего не нашлось»; крестик возвращает список.
  await field.fill('йцукен');
  await expect(page.getByRole('heading', { name: 'Ничего не нашлось' })).toBeVisible();
  await page.getByRole('button', { name: 'Очистить поиск' }).click();
  await expect(field).toHaveValue('');
  await expect(page.getByRole('link', { name: /^Выходные/ })).toBeVisible();

  await field.fill('собран');
  const hit = page.getByRole('button', { name: /Напоминаю: собрание дома в четверг/ });
  await expect(hit).toContainText('Борис');
  await hit.click();
  await expect(page).toHaveURL(/#\/room\/!quiet/);
  await expect(page.getByRole('log').getByText('Напоминаю: собрание дома в четверг')).toBeVisible();
  expect(problems).toEqual([]);
});

test('«Поиск в чате» из «О чате»: только этот чат, нажатие — к сообщению; индекс — в «Хранилище»', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Дом 14/);
  await page.getByRole('button', { name: 'О чате' }).click();
  await page.getByRole('button', { name: 'Поиск', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Поиск в чате' });
  await dialog.getByRole('searchbox', { name: 'Поиск по этому чату' }).fill('во сколько');
  // «Поеду! Во сколько?» — в другом чате, здесь его нет.
  const hit = dialog.getByRole('button', { name: /Во сколько\?/ });
  await expect(hit).toHaveCount(1);
  await expect(hit).toContainText('Вера');
  await hit.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('log').first().getByText('Во сколько?')).toBeVisible();

  await page.goto(page.url().replace(/#.*$/, '#/settings/storage'));
  await expect(page.getByRole('button', { name: 'Очистить поисковый индекс' })).toBeEnabled();
});
