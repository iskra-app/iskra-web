import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { consoleOf, isPhone, openRoom, signInToDemo, watchForProblems } from './helpers';

// Упал — показать консоль: падения в Firefox воспроизводятся только в CI.
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) console.log(`Консоль «${info.title}»:\n${consoleOf(page).slice(-40).join('\n')}`);
});

/** Настоящая PNG 32×20 — градиент. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAUCAIAAABj86gYAAAEqUlEQVR42g3Noc9EYADAYU2xiSZdI14QLr5RsYkmXXPRplx8o2ITTfIrJtoU8Y1XbCJNMtGmqN/3/AOPpmnoGqaGpfHQcDWeGi8NoeFrhBqRxlvjo5FqfDWkRq5RalQajUan0WuMGkrjpzFrLBqbxqFxatwammagG5gGlsHDwDV4GrwMhIFvEBpEBm+Dj0Fq8DWQBrlBaVAZNAadQW8wGiiDn8FssBhsBofBaXAb/4GNbmPaWDYPG9fmafOyETa+TWgT2bxtPjapzddG2uQ2pU1l09h0Nr3NaKNsfjazzWKz2Rw2p81t/wcOuoPpYDk8HFyHp8PLQTj4DqFD5PB2+DikDl8H6ZA7lA6VQ+PQOfQOo4Ny+DnMDovD5nA4nA638x946B6mh+Xx8HA9nh4vD+Hhe4Qekcfb4+ORenw9pEfuUXpUHo1H59F7jB7K4+cxeywem8fhcXrc3n8g0AWmwBI8BK7gKXgJhMAXhIJI8BZ8BKngK5CCXFAKKkEj6AS9YBQowU8wCxbBJjgEp+AW/0GAHmAGWAGPADfgGfAKEAF+QBgQBbwDPgFpwDdABuQBZUAV0AR0AX3AGKACfgFzwBKwBRwBZ8Ad/AcxeowZY8U8YtyYZ8wrRsT4MWFMFPOO+cSkMd8YGZPHlDFVTBPTxfQxY4yK+cXMMUvMFnPEnDF3/B8k6AlmgpXwSHATngmvBJHgJ4QJUcI74ZOQJnwTZEKeUCZUCU1Cl9AnjAkq4ZcwJywJW8KRcCbcyX+QoWeYGVbGI8PNeGa8MkSGnxFmRBnvjE9GmvHNkBl5RplRZTQZXUafMWaojF/GnLFkbBlHxplxZ/+BRJeYEkvykLiSp+QlERJfEkoiyVvykaSSr0RKckkpqSSNpJP0klGiJD/JLFkkm+SQnJJb/gcFeoFZYBU8CtyCZ8GrQBT4BWFBVPAu+BSkBd8CWZAXlAVVQVPQFfQFY4Eq+BXMBUvBVnAUnAV38R/U6DVmjVXzqHFrnjWvGlHj14Q1Uc275lOT1nxrZE1eU9ZUNU1NV9PXjDWq5lcz1yw1W81Rc9bc9X/QoreYLVbLo8Vteba8WkSL3xK2RC3vlk9L2vJtkS15S9lStTQtXUvfMraoll/L3LK0bC1Hy9lyt//BgD5gDlgDjwF34DnwGhAD/kA4EA28Bz4D6cB3QA7kA+VANdAMdAP9wDigBn4D88AysA0cA+fAPfwHCl1hKizFQ+EqnoqXQih8RaiIFG/FR5EqvgqpyBWlolI0ik7RK0aFUvwUs2JRbIpDcSpu9R9M6BPmhDXxmHAnnhOvCTHhT4QT0cR74jORTnwn5EQ+UU5UE81EN9FPjBNq4jcxTywT28QxcU7c03+woq+YK9bKY8Vdea68VsSKvxKuRCvvlc9KuvJdkSv5SrlSrTQr3Uq/Mq6old/KvLKsbCvHyrlyr//Bjr5j7lg7jx1357nz2hE7/k64E+28dz476c53R+7kO+VOtdPsdDv9zrijdn47886ys+0cO+fOvf8HF/qFeWFdPC7ci+fF60Jc+BfhRXTxvvhcpBffC3mRX5QX1UVz0V30F+OFuvhdzBfLxXZxXJwX98Uf1wfxouWu4FQAAAAASUVORK5CYII=', 'base64');

test('фото в ленте: место отведено до загрузки, просмотрщик листает и закрывается', async ({ page }, info) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const photos = page.getByRole('log').getByRole('button', { name: 'Фото' });
  await expect(photos).toHaveCount(2);
  // Пропорции из события: 1200×800 — полтора к одному, ещё до того, как пришли байты.
  const box = (await photos.first().boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(1.5, 1);
  await expect(photos.first().locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(page.getByRole('log')).toContainText('Озеро прошлым летом');

  // Лента пересобирается (новое сообщение) — картинка та же, а не новый <img>: иначе она
  // мигает, а Firefox теряет нажатие, пришедшееся на подмену.
  await photos.first().locator('img').evaluate((img) => img.setAttribute('data-kept', ''));
  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Красиво');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByRole('log').getByRole('article').filter({ hasText: 'Красиво' })).toBeVisible();
  await expect(photos.first().locator('img[data-kept]')).toHaveCount(1);

  await photos.first().click();
  const viewer = page.getByRole('dialog', { name: 'Фото' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('status')).toHaveText('1 из 2');
  await expect(viewer.locator('img')).toHaveAttribute('src', /^blob:/);
  if (!isPhone(info.project.name)) {
    await page.keyboard.press('ArrowRight');
    await expect(viewer.getByRole('status')).toHaveText('2 из 2');
    await page.keyboard.press('ArrowLeft');
    await expect(viewer.getByRole('status')).toHaveText('1 из 2');
  }
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  expect(problems).toEqual([]);
});

test('файл: «Сохранить» скачивает его с исходным именем', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const card = page.getByRole('log').getByRole('article').filter({ hasText: 'Что взять.txt' });
  await expect(card).toContainText('96');
  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Сохранить' }).click();
  expect((await download).suggestedFilename()).toBe('Что взять.txt');
});

test('фото в зашифрованный чат: выбрать → лоток → подпись → ушло и открывается', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  await page.getByRole('log').locator('input[type=file]').or(page.locator('input[type=file]')).first().setInputFiles({ name: 'закат.png', mimeType: 'image/png', buffer: PNG });
  const tile = page.getByRole('img', { name: 'Фото к сообщению' });
  await expect(tile).toBeVisible();
  // «Убрать из сообщения» — и снова добавить: ничего не уходит само.
  await page.getByRole('button', { name: /^Убрать из сообщения/ }).click();
  await expect(tile).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles({ name: 'закат.png', mimeType: 'image/png', buffer: PNG });
  await expect(tile).toBeVisible();

  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Смотри, какой закат');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(tile).toHaveCount(0);
  const sent = page.getByRole('log').getByRole('article').filter({ hasText: 'Смотри, какой закат' });
  await expect(sent.getByRole('button', { name: 'Фото' }).locator('img')).toHaveAttribute('src', /^blob:/, { timeout: 20_000 });
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await sent.getByRole('button', { name: 'Фото' }).click();
  await expect(page.getByRole('dialog', { name: 'Фото' }).locator('img')).toHaveAttribute('src', /^blob:/);
  expect(problems).toEqual([]);
});

test('вставка картинки из буфера и перетаскивание файла — в лоток, а не сразу в чат', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const field = page.getByRole('textbox', { name: 'Сообщение' });
  await field.click();
  await page.evaluate((bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], 'image.png', { type: 'image/png' }));
    // Gecko не берёт `clipboardData` из init (у него свой ClipboardEventInit) — подставляем.
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    document.querySelector('textarea')!.dispatchEvent(event);
  }, [...PNG]);
  await expect(page.getByRole('img', { name: 'Фото к сообщению' })).toHaveCount(1);
  await expect(field).toHaveValue('');

  const region = page.getByRole('region', { name: 'Переписка' });
  const data = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(['список дел'], 'дела.txt', { type: 'text/plain' }));
    return d;
  });
  await region.dispatchEvent('dragenter', { dataTransfer: data });
  await expect(page.getByText('Отпустите, чтобы прикрепить')).toBeVisible();
  await region.dispatchEvent('drop', { dataTransfer: data });
  await expect(page.getByText('Отпустите, чтобы прикрепить')).toBeHidden();
  await expect(page.getByRole('listitem').filter({ hasText: 'дела.txt' })).toBeVisible();
  // Ничего не ушло само.
  await expect(page.getByRole('log').getByRole('article').filter({ hasText: 'дела.txt' })).toHaveCount(0);
});

test('десктоп: Ctrl/⌘ Shift U открывает выбор файла; колесо с Ctrl приближает', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'клавиатура и колесо — десктоп');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('textbox', { name: 'Сообщение' }).press('ControlOrMeta+Shift+U');
  await chooser;

  await page.getByRole('log').getByRole('button', { name: 'Фото' }).first().click();
  const viewer = page.getByRole('dialog', { name: 'Фото' });
  const img = viewer.locator('img');
  await expect(img).toHaveAttribute('src', /^blob:/);
  const before = (await img.boundingBox())!;
  await img.hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await img.boundingBox())!.width).toBeGreaterThan(before.width * 1.5);
  await page.keyboard.press('0');
  await expect.poll(async () => (await img.boundingBox())!.width).toBeCloseTo(before.width, 0);
});

test('десктоп: два пальца по трекпаду — вверх-вниз тянут снимок и закрывают, вбок листают', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'трекпад — десктоп');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  await page.getByRole('log').getByRole('button', { name: 'Фото' }).first().click();
  const viewer = page.getByRole('dialog', { name: 'Фото' });
  await expect(viewer.locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(viewer.getByRole('status')).toHaveText('1 из 2');
  await viewer.locator('img').hover();

  // Вбок дальше порога — следующий снимок: мелкими шагами трекпада, не колёсиком мыши.
  for (let i = 0; i < 5; i++) await page.mouse.wheel(20, 0);
  await expect(viewer.getByRole('status')).toHaveText('2 из 2');
  await page.waitForTimeout(300); // жест кончается тишиной: следующий — уже другой

  // Вверх-вниз, но не до порога, — снимок возвращается и просмотрщик остаётся.
  for (let i = 0; i < 2; i++) await page.mouse.wheel(0, 20);
  await page.waitForTimeout(400);
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('status')).toHaveText('2 из 2');

  // До порога — закрывается.
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 20);
  await expect(viewer).toBeHidden();
});

test('телефон: свайп вниз закрывает просмотрщик', async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), 'палец');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  await page.getByRole('log').getByRole('button', { name: 'Фото' }).first().click();
  const viewer = page.getByRole('dialog', { name: 'Фото' });
  await expect(viewer.locator('img')).toBeVisible();
  const stage = viewer.getByRole('presentation');
  const at = (y: number) => ({ pointerId: 3, pointerType: 'touch', isPrimary: true, clientX: 200, clientY: y });
  await stage.dispatchEvent('pointerdown', at(300));
  for (const y of [320, 360, 420, 480, 520]) await stage.dispatchEvent('pointermove', at(y));
  await stage.dispatchEvent('pointerup', at(520));
  await expect(viewer).toBeHidden();
});

/** JPEG с EXIF-блоком, в котором метка: если метка доехала до получателя — метаданные ушли. */
const EXIF_MARK = 'ISKRA-GPS-55.7558N-37.6173E';
async function jpegWithExif(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async (mark) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 48 });
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#3a6';
    context.fillRect(0, 0, 64, 48);
    const jpeg = new Uint8Array(await (await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.9))).arrayBuffer());
    const payload = new TextEncoder().encode(`Exif\0\0${mark}`);
    const app1 = new Uint8Array([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]);
    return [...jpeg.slice(0, 2), ...app1, ...jpeg.slice(2)];
  }, EXIF_MARK);
  return Buffer.from(bytes);
}

/** Отправить фото в «Аню» и скачать то, что ушло, — через просмотрщик. */
async function sendAndDownload(page: Page, jpeg: Buffer, caption: string): Promise<{ name: string; bytes: Buffer }> {
  await page.locator('input[type=file]').setInputFiles({ name: 'IMG_0001.jpeg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.getByRole('img', { name: 'Фото к сообщению' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Сообщение' }).fill(caption);
  await page.getByRole('button', { name: 'Отправить' }).click();
  const sent = page.getByRole('log').getByRole('article').filter({ hasText: caption });
  await expect(sent.getByRole('button', { name: 'Фото' }).locator('img')).toHaveAttribute('src', /^blob:/, { timeout: 20_000 });
  const viewer = page.getByRole('dialog', { name: 'Фото' });
  // Пузырь перерисовывается, когда эхо заменяется событием сервера: клик, попавший до этого, пропадает (Gecko).
  await expect(async () => {
    await sent.getByRole('button', { name: 'Фото' }).click();
    await expect(viewer).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  const download = page.waitForEvent('download');
  await viewer.getByRole('button', { name: 'Сохранить' }).click();
  const file = await download;
  const bytes = await (await import('node:fs/promises')).readFile((await file.path())!);
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  return { name: file.suggestedFilename(), bytes };
}

test('фото уходит без метаданных; выключили — уходит как есть', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  const jpeg = await jpegWithExif(page);
  expect(jpeg.includes(EXIF_MARK)).toBe(true);

  // По умолчанию — без метаданных и сжатое: метки нет, имя — под новый тип.
  const clean = await sendAndDownload(page, jpeg, 'Без метаданных');
  expect(clean.bytes.includes(EXIF_MARK)).toBe(false);
  expect(clean.name).toBe('IMG_0001.jpg');

  // Выключили и то и другое — файл тот же, байт в байт.
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('navigation', { name: 'Настройки' }).getByRole('link', { name: 'Фото и видео' }).click();
  await page.getByRole('switch', { name: 'Отправлять без метаданных' }).uncheck();
  await page.getByRole('switch', { name: 'Сжимать фото и видео' }).uncheck();
  await expect(page.getByRole('radiogroup', { name: 'Степень сжатия' })).toHaveCount(0);
  await openRoom(page, /^Аня/);
  const asIs = await sendAndDownload(page, jpeg, 'Как есть');
  expect(asIs.bytes.equals(jpeg)).toBe(true);
});

/**
 * Видео с телефона, как оно есть: 1080p, 60 кадров, H.264 + AAC, с меткой в `udta`
 * (`tests/e2e/fixtures/phone-video.mp4`, сделано ffmpeg'ом — видео не нарисуешь).
 */
const PHONE_VIDEO = readFileSync(new URL('./fixtures/phone-video.mp4', import.meta.url));

test('видео уходит без метаданных; где браузер умеет — сжатым в mp4 по ступени', async ({ page }) => {
  await signInToDemo(page);
  // «Сильное»: на ролике в полсекунды регулятор битрейта WebKit не успевает сойтись, и на
  // «Среднем» сжатое выходит больше исходника — тогда уходит исходник, и проверять нечего.
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('navigation', { name: 'Настройки' }).getByRole('link', { name: 'Фото и видео' }).click();
  await page.getByRole('radiogroup', { name: 'Степень сжатия' }).getByRole('radio', { name: 'Сильное (540p)' }).click();
  await openRoom(page, /^Аня/);
  expect(PHONE_VIDEO.includes(EXIF_MARK)).toBe(true);
  // Сжимает сам браузер, и H.264 — не везде (сборки без него). Звук AAC переносится как есть.
  const compressible = await page.evaluate(async () => {
    if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return false;
    const video = await VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: 960, height: 540 }).catch(() => ({ supported: false }));
    const decode = await VideoDecoder.isConfigSupported({ codec: 'avc1.64002a' }).catch(() => ({ supported: false }));
    return !!(video.supported && decode.supported);
  });

  await page.locator('input[type=file]').setInputFiles({ name: 'IMG_0002.MOV', mimeType: 'video/quicktime', buffer: PHONE_VIDEO });
  await expect(page.getByRole('img', { name: 'Видео к сообщению' }).or(page.getByText('IMG_0002.MOV'))).toBeVisible({ timeout: 10_000 });
  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Видео без метаданных');
  await page.getByRole('button', { name: 'Отправить' }).click();
  const sent = page.getByRole('log').getByRole('article').filter({ hasText: 'Видео без метаданных' });
  const viewer = page.getByRole('dialog', { name: 'Видео' });
  await expect(async () => {
    await sent.getByRole('button', { name: 'Видео' }).click();
    await expect(viewer).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  const download = page.waitForEvent('download');
  await viewer.getByRole('button', { name: 'Сохранить' }).click();
  const file = await download;
  const bytes = await (await import('node:fs/promises')).readFile((await file.path())!);

  expect(bytes.includes(EXIF_MARK)).toBe(false);
  if (compressible) {
    expect(file.suggestedFilename()).toBe('IMG_0002.mp4');
    expect(bytes.length).toBeLessThan(PHONE_VIDEO.length);
    // `tkhd` хранит ширину и высоту в 16.16, в конце (у версии 1 — дальше: времена 64-битные).
    // У дорожки звука они нули; у видео — 960×540, рамка «Сильного».
    const frames: number[][] = [];
    for (let at = bytes.indexOf('tkhd'); at >= 0; at = bytes.indexOf('tkhd', at + 4)) {
      const sizes = bytes[at + 4] === 1 ? at + 92 : at + 80;
      frames.push([bytes.readUInt32BE(sizes) / 65536, bytes.readUInt32BE(sizes + 4) / 65536]);
    }
    expect(frames.filter(([width]) => (width ?? 0) > 0)).toEqual([[960, 540]]);
  }
});

test('автозагрузка «Никогда»: чужое фото — рамкой с «Загрузить», нажатие загружает', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('navigation', { name: 'Настройки' }).getByRole('link', { name: 'Фото и видео' }).click();
  await page.getByRole('radiogroup', { name: 'Автозагрузка' }).getByRole('radio', { name: 'Никогда' }).click();
  await expect(page.getByText('Аватарки и стикеры — всегда')).toBeVisible();

  await openRoom(page, /^Выходные/);
  const waiting = page.getByRole('log').getByRole('button', { name: 'Фото: Загрузить' });
  await expect(waiting).toHaveCount(2);
  await expect(waiting.first().locator('img')).toHaveCount(0);
  await waiting.first().click();
  const photos = page.getByRole('log').getByRole('button', { name: 'Фото', exact: true });
  await expect(photos.first().locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(waiting).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('альбом: три фото, отправленные разом, — один пузырь с подписью; плитка открывает просмотрщик на себе', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Дом 14/);
  const album = page.getByRole('log').getByRole('article').filter({ hasText: 'Двор сейчас' });
  await expect(album).toHaveCount(1);
  const tiles = album.getByRole('button', { name: 'Фото' });
  await expect(tiles).toHaveCount(3);
  // Плитки — внутри одной рамки, без наложений: вторая и третья не там же, где первая.
  const boxes = await Promise.all([0, 1, 2].map(async (i) => (await tiles.nth(i).boundingBox())!));
  expect(new Set(boxes.map((b) => `${Math.round(b.x)},${Math.round(b.y)}`)).size).toBe(3);
  await tiles.nth(1).click();
  const viewer = page.getByRole('dialog', { name: 'Фото' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('status')).toHaveText('2 из 3');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  expect(problems).toEqual([]);
});
