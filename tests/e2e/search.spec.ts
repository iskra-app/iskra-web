import { expect, test } from '@playwright/test';
import { consoleOf, openRoom, signInToDemo, watchForProblems } from './helpers';

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) console.log(`Консоль «${info.title}»:\n${consoleOf(page).slice(-40).join('\n')}`);
});

test('поиск по сообщениям: окно по лупе, нажатие открывает чат на сообщении', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);

  await page.getByRole('button', { name: 'Поиск по сообщениям' }).click();
  const dialog = page.getByRole('dialog', { name: 'Поиск по сообщениям' });
  const field = dialog.getByRole('searchbox', { name: 'Поиск по сообщениям' });
  await expect(field).toBeFocused();
  // Слово, которого нет нигде, — «Ничего не нашлось»; крестик стирает запрос.
  await field.fill('йцукен');
  await expect(dialog.getByRole('heading', { name: 'Ничего не нашлось' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Очистить поиск' }).click();
  await expect(field).toHaveValue('');

  await field.fill('собран');
  const hit = dialog.getByRole('button', { name: /Напоминаю: собрание дома в четверг/ });
  await expect(hit).toContainText('Борис');
  await expect(hit).toContainText('Дом 14, подъезд 2');
  await hit.click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/#\/room\/!quiet/);
  await expect(page.getByRole('log').getByText('Напоминаю: собрание дома в четверг').first()).toBeVisible();
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
