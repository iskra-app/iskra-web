import { expect, test } from '@playwright/test';
import { signInToDemo } from './helpers';

test('«Бета-функции» — тремя щелчками по значку в «Об Iskra»; мордочки — там, а не во «Внешнем виде»; Esc — как «Назад»', async ({ page }) => {
  await signInToDemo(page);
  await page.getByRole('button', { name: 'Настройки' }).click();
  const sections = page.getByRole('navigation', { name: 'Настройки' });

  await sections.getByRole('link', { name: 'Внешний вид' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Тема' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Аватарки' })).toHaveCount(0);
  // Esc из раздела — к списку разделов, как стрелка в шапке.
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/settings$/);

  await sections.getByRole('link', { name: 'Об Iskra' }).click();
  // Строки к бете нет: её находит тот, кто ищет.
  await expect(page.getByRole('link', { name: 'Бета-функции' })).toHaveCount(0);
  await page.locator('.app-icon').click({ clickCount: 3 });
  await expect(page).toHaveURL(/#\/settings\/beta$/);
  const faces = page.getByRole('radiogroup', { name: 'Аватарки' });
  await faces.getByRole('radio', { name: /^Мордочки/ }).click();
  await expect(faces.getByRole('radio', { name: /^Мордочки/ })).toHaveAttribute('aria-checked', 'true');

  // «Для разработчиков»: адрес сервера и два переключателя, выключенные по умолчанию.
  await expect(page.getByRole('heading', { name: 'Для разработчиков' })).toBeVisible();
  const source = page.getByRole('switch', { name: 'JSON сообщения в меню' });
  await expect(source).not.toBeChecked();
  await source.check();
  await expect(page.getByRole('switch', { name: 'Все события в чате' })).not.toBeChecked();

  // Esc — назад туда, откуда пришли: в «Об Iskra», потом к списку.
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/settings\/about$/);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/settings$/);
});
