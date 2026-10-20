import { expect, test } from '@playwright/test';
import { consoleOf, openRoom, signInToDemo, watchForProblems } from './helpers';

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) console.log(`Консоль «${info.title}»:\n${consoleOf(page).slice(-40).join('\n')}`);
});

test('треды: строка под корнем, тред панелью, ответ в треде; «Никогда» — строки нет', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  // «Дом 14» — больше ста человек: треды там видны по умолчанию.
  await openRoom(page, /^Дом 14/);

  const line = page.getByRole('log').getByRole('button', { name: /3 ответа/ });
  await expect(line).toContainText('Вера: Приду');
  await line.click();

  await expect(page.getByRole('heading', { name: 'Тред' })).toBeVisible();
  await expect(page).toHaveURL(/\/thread\/%24quiet-0$/);
  // Лента треда — последняя на странице: на широком экране чат остаётся слева.
  const thread = page.getByRole('log').last();
  await expect(thread.getByText('Напоминаю: собрание дома в четверг')).toBeVisible();
  await expect(thread.getByText('В семь, во дворе')).toBeVisible();

  const field = page.getByRole('textbox', { name: 'Сообщение' }).last();
  await field.fill('Буду с соседкой');
  await page.getByRole('button', { name: 'Отправить' }).last().click();
  await expect(thread.getByText('Буду с соседкой')).toBeVisible();

  await page.getByRole('button', { name: 'Закрыть тред' }).click();
  await expect(page.getByRole('heading', { name: 'Тред' })).toBeHidden();
  await expect(page.getByRole('log').getByRole('button', { name: /4 ответа/ })).toContainText('Буду с соседкой');

  await page.goto(page.url().replace(/#.*$/, '#/settings/chats'));
  await page.getByRole('radio', { name: 'Никогда' }).click();
  await expect(page.getByRole('switch', { name: 'Скрывать ответы из чата' })).toBeDisabled();
  await openRoom(page, /^Дом 14/);
  await expect(page.getByRole('log').getByText('Напоминаю: собрание дома в четверг')).toBeVisible();
  await expect(page.getByRole('log').getByRole('button', { name: /ответ/ })).toHaveCount(0);
  expect(problems).toEqual([]);
});
