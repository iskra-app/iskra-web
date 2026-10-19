import { expect, test, type Page } from '@playwright/test';
import { isPhone, signInToDemo, watchForProblems } from './helpers';

test('список чатов из демо: имена, превью, значки, заголовок вкладки', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);

  const weekend = page.getByRole('link', { name: /^Выходные/ });
  await expect(weekend).toBeVisible();
  await expect(weekend).toContainText('Алиса, ты с нами?');
  // Упоминание — «@», число — рядом; скринридер слышит оба.
  await expect(weekend).toHaveAccessibleName(/3 непрочитанных, 1 упоминание вас/);
  await expect(page.getByRole('link', { name: /^Аня, Защищённый чат, Закреплённый чат/ })).toBeVisible();
  // Приглашение, личный чат, упоминание; беззвучный «Дом 14» не в счёт.
  await expect(page).toHaveTitle('(3) Iskra Web');
  expect(problems).toEqual([]);
});

test('один список на любой ширине: архив сверху, приглашение, закреплённый, дальше по активности', async ({ page }) => {
  await signInToDemo(page);
  const column = page.locator('.list-column');
  // Ни заголовков разделов, ни фильтров — как в нативной Искре.
  await expect(column.getByRole('heading', { level: 2 })).toHaveCount(0);
  await expect(column.getByRole('toolbar')).toHaveCount(0);

  const order = await column.locator('button.archive, [role=group], a[data-room-id]').evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('aria-label') ?? row.textContent?.trim().split('\n')[0] ?? ''),
  );
  expect(order[0]).toMatch(/^Архив/);
  expect(order[1]).toBe('Книжный клуб');
  expect(order[2]).toMatch(/^Аня/);
  // Пространство «Семья» — не отдельным разделом, а среди чатов, после закреплённого.
  expect(order.slice(3).some((name) => name.startsWith('Семья'))).toBe(true);
  expect(order.findIndex((name) => name.startsWith('Выходные'))).toBeLessThan(order.findIndex((name) => name.startsWith('Дом 14')));
});

test('чат открывается из списка, его имя — в шапке', async ({ page }) => {
  await signInToDemo(page);
  await page.getByRole('link', { name: /^Выходные/ }).click();
  await expect(page).toHaveURL(/#\/room\/!weekend/);
  await expect(page.getByRole('heading', { name: 'Выходные', level: 1 })).toBeVisible();
});

test('архив и пространство открываются на месте списка', async ({ page }) => {
  await signInToDemo(page);
  await page.getByRole('button', { name: 'Архив (1)' }).click();
  await expect(page.getByRole('link', { name: /^Старый проект/ })).toBeVisible();
  await page.getByRole('button', { name: 'Назад' }).first().click();
  await expect(page.getByRole('link', { name: /^Выходные/ })).toBeVisible();
});

test('приглашение: «Войти» — и это обычный чат', async ({ page }) => {
  await signInToDemo(page);
  const invite = page.getByRole('group', { name: 'Книжный клуб' });
  await expect(invite).toContainText('Борис приглашает вас');
  await invite.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('link', { name: /^Книжный клуб/ })).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveTitle('(2) Iskra Web');
});

test('Ctrl/⌘ K — быстрый переход по названию', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'клавиатура — десктоп');
  await signInToDemo(page);
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: 'Перейти к чату' });
  await expect(dialog).toBeVisible();
  await page.keyboard.type('дом');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Дом 14, подъезд 2', level: 1 })).toBeVisible();
});

test('Alt ↓ — следующий чат', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'клавиатура — десктоп');
  await signInToDemo(page);
  await page.getByRole('link', { name: /^Аня/ }).click();
  // Сначала чат должен открыться — иначе «следующий» считается от «никакого».
  await expect(page.getByRole('heading', { name: 'Аня', level: 1 })).toBeVisible();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.getByRole('heading', { name: 'Выходные', level: 1 })).toBeVisible();
});

/** Меню строки: правым щелчком на десктопе, долгим нажатием — на телефоне. */
async function rowMenu(page: Page, name: RegExp, phone: boolean) {
  const row = page.getByRole('link', { name });
  const menu = page.getByRole('menu', { name: /^Действия с чатом/ });
  if (phone) {
    const box = (await row.boundingBox())!;
    const at = { clientX: box.x + 20, clientY: box.y + 20, pointerId: 9, pointerType: 'touch', isPrimary: true };
    await row.dispatchEvent('pointerdown', at);
    await expect(menu).toBeVisible();
    await row.dispatchEvent('pointerup', at);
    // Отпущенный палец — не щелчок по ссылке: чат не открылся.
    await row.dispatchEvent('click', { button: 0 });
    await expect(page).not.toHaveURL(/#\/room\//);
  } else {
    await row.click({ button: 'right' });
  }
  await expect(menu).toBeVisible();
  return menu;
}

test('меню строки: прочитано и непрочитано, закрепить, в архив — как под «подглядыванием» нативной', async ({ page }, info) => {
  const problems = watchForProblems(page);
  const phone = isPhone(info.project.name);
  await signInToDemo(page);
  const weekend = page.getByRole('link', { name: /^Выходные/ });

  let menu = await rowMenu(page, /^Выходные/, phone);
  // Папок нет — нет и «В папку».
  await expect(menu.getByRole('menuitem')).toHaveText(['Открыть чат', 'Отметить прочитанным', 'Закрепить', 'В архив']);
  await menu.getByRole('menuitem', { name: 'Отметить прочитанным' }).click();
  await expect(weekend).not.toHaveAccessibleName(/непрочитанн/);

  menu = await rowMenu(page, /^Выходные/, phone);
  await menu.getByRole('menuitem', { name: 'Отметить непрочитанным' }).click();
  await expect(weekend).toHaveAccessibleName(/Есть непрочитанные/);

  menu = await rowMenu(page, /^Выходные/, phone);
  await menu.getByRole('menuitem', { name: 'Закрепить' }).click();
  await expect(weekend).toHaveAccessibleName(/Закреплённый чат/);

  menu = await rowMenu(page, /^Выходные/, phone);
  await menu.getByRole('menuitem', { name: 'В архив' }).click();
  await expect(weekend).toHaveCount(0);
  await page.getByRole('button', { name: 'Архив (2)' }).click();
  menu = await rowMenu(page, /^Выходные/, phone);
  await menu.getByRole('menuitem', { name: 'Из архива' }).click();
  await expect(weekend).toHaveCount(0);
  await page.getByRole('button', { name: 'Назад' }).first().click();
  await expect(weekend).toBeVisible();

  // С клавиатуры — клавиша меню на строке в фокусе; «Открыть чат» открывает.
  if (!phone) {
    await weekend.focus();
    await page.keyboard.press('Shift+F10');
    menu = page.getByRole('menu', { name: /^Действия с чатом/ });
    await menu.getByRole('menuitem', { name: 'Открыть чат' }).click();
    await expect(page).toHaveURL(/#\/room\/!weekend/);
  }
  expect(problems).toEqual([]);
});

test('«В папку» из меню строки: галочка — чат в папке, снятая — исключён', async ({ page }, info) => {
  const problems = watchForProblems(page);
  const phone = isPhone(info.project.name);
  await signInToDemo(page);
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('navigation', { name: 'Настройки' }).getByRole('link', { name: 'Папки' }).click();
  await page
    .getByRole('list', { name: 'Можно начать с этих' })
    .getByRole('listitem')
    .filter({ hasText: 'Личные' })
    .getByRole('button', { name: 'Добавить' })
    .click();
  await expect(page.getByRole('button', { name: /^Личные\s*\d+$/ })).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Папки' });
  await expect(async () => {
    if (!(await tabs.isVisible())) await page.getByRole('button', { name: 'Назад' }).click({ timeout: 1000 });
    await expect(tabs).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  const menu = await rowMenu(page, /^Выходные/, phone);
  await menu.getByRole('menuitem', { name: 'В папку' }).click();
  const sheet = page.getByRole('dialog', { name: 'Выходные' });
  const personal = sheet.getByRole('checkbox', { name: 'Личные' });
  await expect(personal).not.toBeChecked();
  await personal.check();
  await expect(personal).toBeChecked();
  await sheet.getByRole('button', { name: 'Готово' }).click();
  await expect(sheet).toBeHidden();

  await tabs.getByRole('tab', { name: /^Личные/ }).click();
  await expect(page.getByRole('link', { name: /^Выходные/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Аня/ })).toBeVisible();

  // Сняли галочку у личного чата — его в «Личных» нет, хоть он и подходит под правило.
  const again = await rowMenu(page, /^Аня/, phone);
  await again.getByRole('menuitem', { name: 'В папку' }).click();
  await page.getByRole('dialog', { name: 'Аня' }).getByRole('checkbox', { name: 'Личные' }).uncheck();
  await page.getByRole('dialog', { name: 'Аня' }).getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByRole('link', { name: /^Аня/ })).toHaveCount(0);
  expect(problems).toEqual([]);
});
