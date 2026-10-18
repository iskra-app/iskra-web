import { expect, test, type Page } from '@playwright/test';
import { isPhone, signInToDemo, watchForProblems } from './helpers';

async function openRoom(page: Page, name: RegExp) {
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('log')).toBeVisible();
}

test('лента чата: сообщения, серии, служебные строки, реакции, правка', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const log = page.getByRole('log');
  await expect(log).toContainText('Кто что берёт на пикник?');
  await expect(log).toContainText('Алиса, ты с нами?');
  await expect(log).toContainText('Куда едем?');
  if (await page.getByRole('button', { name: 'Назад' }).isVisible()) await page.getByRole('button', { name: 'Назад' }).click();
  await openRoom(page, /^Аня/);
  await expect(page.getByRole('log')).toContainText('В десять у метро');
  await expect(page.getByRole('log')).toContainText('изменено');
  await expect(page.getByRole('list', { name: 'Реакции' })).toContainText('🔥 1');
  expect(problems).toEqual([]);
});

test('отправка: Enter на десктопе, кнопка на телефоне; сообщение одно, не два', async ({ page }, info) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const field = page.getByRole('textbox', { name: 'Сообщение' });
  await field.fill('Беру мангал');
  if (isPhone(info.project.name)) {
    await field.press('Enter');
    await expect(field).toHaveValue('Беру мангал\n');
    await field.fill('Беру мангал');
    await page.getByRole('button', { name: 'Отправить' }).click();
  } else {
    await field.press('Shift+Enter');
    await expect(field).toHaveValue('Беру мангал\n');
    await field.fill('Беру мангал');
    await field.press('Enter');
  }
  await expect(field).toHaveValue('');
  const sent = page.getByRole('log').getByText('Беру мангал', { exact: true });
  await expect(sent).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'Отправляется' })).toHaveCount(0, { timeout: 10_000 });
  await expect(sent).toHaveCount(1);
  // Превью в списке — тоже новое.
  if (!isPhone(info.project.name)) await expect(page.getByRole('link', { name: /^Выходные/ })).toContainText('Беру мангал');
});

test('не ушло — «Не отправлено» и «Отправить заново»', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Сбой отправки');
  await page.getByRole('button', { name: 'Отправить' }).click();
  const alert = page.getByRole('log').getByRole('alert');
  await expect(alert).toContainText('Не отправлено');
  await alert.getByRole('button', { name: 'Отправить заново' }).click();
  await expect(alert).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole('log').getByText('Сбой отправки', { exact: true })).toHaveCount(1);
});

test('история: окно наполняется, прокрутка вверх подгружает без прыжка', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'хватит десктопа: логика одна');
  await page.setViewportSize({ width: 1440, height: 1400 });
  await signInToDemo(page);
  await openRoom(page, /^Длинная история/);
  const scroller = page.locator('.scroller');
  // Высокое окно: ленту дозагрузили, пока её не стало можно прокрутить.
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 400)).toBe(true);
  // Внизу — последнее сообщение.
  await expect(page.getByRole('log').getByText('Сообщение номер 400', { exact: true })).toBeInViewport();

  // Вверх до упора. В тот же момент (подгрузка ещё не пришла) запоминаем верхнее видимое
  // сообщение — ровно то, что держит якорь, — и где оно стоит.
  const count = () => page.locator('.item').count();
  const before = await count();
  const marker = await scroller.evaluate((el) => {
    el.scrollTop = 0;
    const top = el.getBoundingClientRect().top;
    const first = [...el.querySelectorAll<HTMLElement>('[data-anchor]')].find((item) => item.getBoundingClientRect().bottom > top)!;
    return { key: first.dataset['anchor']!, y: first.getBoundingClientRect().top };
  });
  await expect.poll(count).toBeGreaterThan(before);
  // История пришла сверху — а сообщение, на которое человек смотрел, осталось, где было.
  await expect
    .poll(async () => Math.abs((await page.locator(`.item[data-anchor="${marker.key}"]`).boundingBox())!.y - marker.y))
    .toBeLessThan(2);
});

test('ширина окна меняется — место чтения остаётся', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'десктоп');
  await signInToDemo(page);
  await openRoom(page, /^Длинная история/);
  const scroller = page.locator('.scroller');
  // Ленты должно хватать на честную середину: подгружаем ещё страницу-другую.
  await scroller.evaluate((el) => (el.scrollTop = 0));
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight > el.clientHeight * 3)).toBe(true);
  // В середину — дальше 400 px от верха (там подгрузка) и 80 px от низа (там «прилипание»).
  await scroller.evaluate((el) => (el.scrollTop = (el.scrollHeight - el.clientHeight) / 2));
  await page.waitForTimeout(100);
  // Верхнее видимое сообщение и его отступ от верха окна — по data-anchor, как у якоря.
  const firstVisible = () =>
    scroller.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const item = [...el.querySelectorAll<HTMLElement>('[data-anchor]')].find((i) => i.getBoundingClientRect().bottom > box.top)!;
      return { key: item.dataset['anchor']!, offset: item.getBoundingClientRect().top - box.top };
    });
  const before = await firstVisible();
  await page.setViewportSize({ width: 800, height: 900 });
  // Строки переносятся иначе, пузыри меняют высоту — а читаемое сообщение остаётся на месте.
  await expect
    .poll(() => scroller.evaluate((el, key) => {
      const box = el.getBoundingClientRect();
      return document.querySelector(`[data-anchor="${key}"]`)!.getBoundingClientRect().top - box.top;
    }, before.key))
    .toBeCloseTo(before.offset, 0);
});

test('«@» в группе: список над полем, выбор — ссылкой на человека; Markdown — как в мессенджерах', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const field = page.getByRole('textbox', { name: 'Сообщение' });
  await field.pressSequentially('Привет, @ве');
  const list = page.getByRole('listbox', { name: 'Кого упомянуть' });
  await expect(list.getByRole('option')).toHaveCount(1);
  await expect(list.getByRole('option', { name: 'Вера' })).toHaveAttribute('aria-selected', 'true');
  await field.press('Enter');
  await expect(list).toBeHidden();
  await expect(field).toHaveValue('Привет, @Вера ');
  await field.pressSequentially('это *важно*');
  await expect(field).toHaveValue('Привет, @Вера это *важно*');
  // Кнопкой: на телефоне Enter переносит строку.
  await page.getByRole('button', { name: 'Отправить' }).click();

  const log = page.getByRole('log');
  // Упоминание — имя, а не ссылка на чужой сайт; одна звёздочка — жирный, без значков.
  await expect(log.locator('.mention', { hasText: '@Вера' })).toBeVisible();
  await expect(log.locator('strong', { hasText: 'важно' })).toBeVisible();
  await expect(log).not.toContainText('*важно*');

  // `Esc` закрывает список, следующий символ открывает снова.
  await field.pressSequentially('@');
  await expect(list).toBeVisible();
  await field.press('Escape');
  await expect(list).toBeHidden();
  await field.pressSequentially('б');
  await expect(list.getByRole('option', { name: 'Борис' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('в личном чате списка «@» нет', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  await page.getByRole('textbox', { name: 'Сообщение' }).pressSequentially('@а');
  await expect(page.getByRole('listbox', { name: 'Кого упомянуть' })).toHaveCount(0);
});

test('«Непрочитанные сообщения»: полоса над новым — весь визит; ушли, дочитав, — в следующий раз её нет', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  const log = page.getByRole('log');
  const divider = log.getByRole('heading', { name: 'Непрочитанные сообщения' });
  await expect(divider).toBeVisible();
  // Полоса — между прочитанным и новым.
  const order = await log.evaluate((element) => {
    const text = element.textContent ?? '';
    return [text.indexOf('Поеду! Во сколько?'), text.indexOf('Непрочитанные сообщения'), text.indexOf('В десять у метро')];
  });
  expect(order[0]).toBeLessThan(order[1]!);
  expect(order[1]).toBeLessThan(order[2]!);

  // Дочитали и ушли — маркер переехал в конец; вернулись — полосы нет.
  await page.getByRole('textbox', { name: 'Сообщение' }).press('Escape');
  // На телефоне чат занимает весь экран — к списку через «Назад».
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await openRoom(page, /^Выходные/);
  if (await back.isVisible()) await back.click();
  await openRoom(page, /^Аня/);
  await expect(page.getByRole('log')).toContainText('Возьми плед, там ветрено');
  await expect(page.getByRole('log').getByRole('heading', { name: 'Непрочитанные сообщения' })).toHaveCount(0);
  expect(problems).toEqual([]);
});
