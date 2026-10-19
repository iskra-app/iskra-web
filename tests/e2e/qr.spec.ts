import { expect, test } from '@playwright/test';
import { openRoom, signInToDemo } from './helpers';

test('QR-код: свой — из настроек, собеседника — из «О чате»; под кодом — адрес, «Поделиться» и «Закрыть»', async ({ page }) => {
  await signInToDemo(page);
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'QR-код' }).click();
  const sheet = page.getByRole('dialog', { name: 'QR-код' });
  await expect(sheet).toContainText('@alice:demo.iskra.invalid');
  await expect(sheet.getByRole('button', { name: 'Поделиться' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Закрыть' }).click();
  await expect(sheet).toBeHidden();

  await openRoom(page, /^Аня/);
  await page.getByRole('button', { name: 'О чате' }).click();
  await page.getByRole('button', { name: 'QR-код' }).click();
  await expect(sheet).toContainText('@anya:demo.iskra.invalid');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});
