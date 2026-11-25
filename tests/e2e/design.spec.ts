import { expect, test } from '@playwright/test';
import { isPhone, signInToDemo, openRoom } from './helpers';

const accents = ['blue', 'red', 'orange', 'yellow', 'green', 'cyan', 'violet', 'mono'] as const;

test('тема и акценты сохраняют контраст текста переписки и акцентных кнопок', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'Те же цветовые токены действуют в сенсорном режиме');
  await signInToDemo(page);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await openRoom(page, /^Выходные/);
  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Проверка контраста');
  const send = page.getByRole('button', { name: 'Отправить', exact: true });
  await expect(send).toBeVisible();

  for (const theme of ['light', 'dark'] as const) {
    // Переключение на лету важно для элементов, наследующих основной цвет от body.
    await page.emulateMedia({ colorScheme: theme });
    for (const accent of accents) {
      await page.evaluate((color) => { document.documentElement.dataset['accent'] = color; }, accent);
      await expect.poll(() => send.evaluate((button) => {
        const luminance = (color: string) => {
          const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
          const r = channels[0] ?? 0;
          const g = channels[1] ?? 0;
          const b = channels[2] ?? 0;
          const linear = (value: number) => {
            const s = value / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return linear(r) * 0.2126 + linear(g) * 0.7152 + linear(b) * 0.0722;
        };
        const ratio = (ink: string, ground: string) => {
          const a = luminance(ink);
          const b = luminance(ground);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const style = getComputedStyle(button);
        const body = getComputedStyle(document.body);
        const bubble = getComputedStyle(document.querySelector('.bubble')!);
        const bubbleGround = bubble.backgroundColor === 'rgba(0, 0, 0, 0)' ? body.backgroundColor : bubble.backgroundColor;
        return Math.min(
          ratio(style.color, style.backgroundColor),
          ratio(body.color, body.backgroundColor),
          ratio(bubble.color, bubbleGround),
        );
      }), { message: `Контраст текста: ${theme}/${accent}` }).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('список чатов сворачивается без потери открытого чата и черновика', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'В узком окне чат открывается отдельным экраном');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);

  const hide = page.getByRole('button', { name: 'Скрыть список чатов' });
  const show = page.getByRole('button', { name: 'Показать список чатов' });
  await expect(hide.locator('.sidebar-spark')).toBeVisible();
  await expect(hide.locator('.sidebar-toggle')).toBeHidden();
  await hide.hover();
  await expect(hide.locator('.sidebar-toggle')).toBeVisible();
  await expect(page.locator('.main-column header').getByRole('button', { name: /список чатов/ })).toHaveCount(0);
  const draft = page.getByRole('textbox', { name: 'Сообщение' });
  await draft.fill('Возьму плед');
  await hide.click();
  await expect(show).toHaveAttribute('aria-expanded', 'false');
  await page.mouse.move(500, 50);
  await expect(show.locator('.sidebar-spark')).toBeVisible();
  await show.hover();
  await expect(show.locator('.sidebar-toggle')).toBeVisible();
  const weekend = page.getByRole('link', { name: /^Выходные/ });
  await expect(weekend).toBeVisible();
  await expect(weekend).toHaveAttribute('aria-current', 'page');
  await expect(weekend.locator('.body')).toHaveCount(0);
  const anya = page.getByRole('link', { name: /^Аня/ });
  await expect(anya.locator('.avatar-badge .badges')).toBeVisible();

  const compose = page.getByRole('button', { name: 'Новый чат или комната' });
  await compose.click();
  const newChat = page.getByRole('dialog', { name: 'Новый чат' });
  await expect(newChat).toBeVisible();
  await expect(newChat.getByRole('button', { name: 'Отмена', exact: true })).toHaveCount(0);
  await newChat.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(newChat).toBeHidden();

  const search = page.getByRole('button', { name: 'Поиск по сообщениям' });
  await search.click();
  const searchDialog = page.getByRole('dialog', { name: 'Поиск по сообщениям' });
  await expect(searchDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(searchDialog).toBeHidden();

  const archive = page.getByRole('button', { name: 'Архив', exact: true });
  await archive.click();
  await expect(page.getByRole('link', { name: /^Старый проект/ })).toBeVisible();
  await archive.click();
  await expect(weekend).toBeVisible();

  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Настройки', level: 1 })).toBeVisible();
  await anya.click();
  await expect(anya).toHaveAttribute('aria-current', 'page');
  await weekend.click();
  await expect(draft).toHaveValue('Возьму плед');

  await show.click();
  await expect(hide).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: /^Выходные/ })).toBeVisible();
  await expect(draft).toHaveValue('Возьму плед');
});
