import { expect, test } from '@playwright/test';

/**
 * Ночная сборка живёт на GitHub Pages: CSP только тегом `<meta>`, где `frame-ancestors` не
 * работает. Здесь то же самое — заголовок без `frame-ancestors` — и чужая страница с фреймом.
 */
test('во фрейме приложение не запускается, само по себе — запускается', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/framer.html') {
      await route.fulfill({ contentType: 'text/html', body: '<iframe src="/" title="iskra" width="400" height="400"></iframe>' });
      return;
    }
    const response = await route.fetch();
    const headers = { ...response.headers() };
    const csp = headers['content-security-policy'];
    if (csp) headers['content-security-policy'] = csp.replace(/;\s*frame-ancestors[^;]*/, '');
    await route.fulfill({ response, headers });
  });

  await page.goto('/framer.html');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#app')).toBeAttached();
  // Ни входа, ни загрузки: старт не дошёл до `mount`.
  await page.waitForTimeout(1500);
  await expect(frame.locator('#app > *')).toHaveCount(0);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Где ваш аккаунт?' })).toBeVisible();
});
