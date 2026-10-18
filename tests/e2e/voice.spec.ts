import { expect, test, type Page } from '@playwright/test';
import { consoleOf, isPhone, signInToDemo, watchForProblems } from './helpers';

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) console.log(`Консоль «${info.title}»:\n${consoleOf(page).slice(-40).join('\n')}`);
});

/**
 * Микрофон и рекордер — подставные. Поток настоящий (`AudioContext` с генератором: волна
 * рисуется по нему), а `MediaRecorder` — поддельный и «пишет AAC»: Chromium Playwright
 * собран без AAC-кодировщика, а разрешение на микрофон в WebKit и Firefox не выдать.
 */
async function fakeMicrophone(page: Page) {
  await page.addInitScript(() => {
    class FakeRecorder extends EventTarget {
      static isTypeSupported = (type: string) => type.startsWith('audio/mp4;codecs=');
      state: 'inactive' | 'recording' = 'inactive';
      ondataavailable: ((event: Event) => void) | null = null;
      onstop: ((event: Event) => void) | null = null;
      private emit(data: Blob) {
        const event = Object.assign(new Event('dataavailable'), { data });
        this.ondataavailable?.(event);
        this.dispatchEvent(event);
      }
      start() {
        this.state = 'recording';
      }
      stop() {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        setTimeout(() => {
          this.emit(new Blob([new Uint8Array(2048).fill(7)], { type: 'audio/mp4' }));
          const event = new Event('stop');
          this.onstop?.(event);
          this.dispatchEvent(event);
        });
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { value: FakeRecorder, configurable: true });
    const mediaDevices = navigator.mediaDevices ?? {};
    Object.defineProperty(navigator, 'mediaDevices', { value: mediaDevices, configurable: true });
    Object.defineProperty(mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const audio = new AudioContext();
        const tone = audio.createOscillator();
        const out = audio.createMediaStreamDestination();
        tone.connect(out);
        tone.start();
        return out.stream;
      },
    });
  });
}

async function openChat(page: Page) {
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await page.getByRole('link', { name: /^Выходные/ }).click();
  await expect(page.getByRole('log')).toBeVisible();
}

test('голосовое: нажатие — запись без рук, «Отправить» — пузырь в ленте', async ({ page }) => {
  const problems = watchForProblems(page);
  await fakeMicrophone(page);
  await signInToDemo(page);
  await openChat(page);

  const composer = page.getByRole('textbox', { name: 'Сообщение' });
  const record = page.getByRole('button', { name: 'Записать голосовое' });
  // Микрофон — только при пустом поле: с текстом на его месте «Отправить».
  await composer.fill('черновик');
  await expect(record).toBeHidden();
  await composer.fill('');
  await record.click();

  const strip = page.getByRole('group', { name: 'Запись голосового' });
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('0:01', { timeout: 5000 });
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(strip).toBeHidden();

  const bubble = page.getByRole('log').getByRole('article').filter({ hasText: 'Голосовое сообщение.m4a' });
  await expect(bubble).toBeVisible();
  await expect(bubble.getByRole('button', { name: 'Слушать' })).toBeVisible();
  // Черновик не потерялся под полосой записи — поле вернулось пустым, как было.
  await expect(composer).toHaveValue('');
  expect(problems).toEqual([]);
});

test('голосовое: «Остановить» — послушать перед отправкой; «Отмена» и Esc — ничего не уходит', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'клавиатура и «Остановить» — путь десктопа');
  await fakeMicrophone(page);
  await signInToDemo(page);
  await openChat(page);
  const articles = page.getByRole('log').getByRole('article');
  const before = await articles.count();

  const record = page.getByRole('button', { name: 'Записать голосовое' });
  await record.click();
  const strip = page.getByRole('group', { name: 'Запись голосового' });
  await expect(strip).toContainText('0:01', { timeout: 5000 });
  await page.getByRole('button', { name: 'Остановить запись' }).click();
  await expect(strip.getByRole('button', { name: 'Слушать' })).toBeVisible();
  await strip.getByRole('button', { name: 'Отмена' }).click();
  await expect(strip).toBeHidden();

  // С клавиатуры: Enter начинает, Esc выбрасывает.
  await record.focus();
  await page.keyboard.press('Enter');
  await expect(strip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(strip).toBeHidden();
  await expect(record).toBeFocused();

  await page.waitForTimeout(500);
  expect(await articles.count()).toBe(before);
});

test('голосовое: удержание — отпустил и отправилось; увёл в сторону — отменено', async ({ page }) => {
  await fakeMicrophone(page);
  await signInToDemo(page);
  await openChat(page);
  const record = page.getByRole('button', { name: 'Записать голосовое' });
  const strip = page.getByRole('group', { name: 'Запись голосового' });
  // Смена экрана на телефоне — переход; `hover` ждёт, пока кнопка встанет и примет нажатие.
  await record.hover();
  const box = (await record.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Увёл влево — выброшено, хоть палец ещё и держит.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(strip).toBeVisible();
  await page.mouse.move(x - 150, y, { steps: 5 });
  await expect(strip).toBeHidden();
  await page.mouse.up();

  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(strip).toContainText('0:01', { timeout: 5000 });
  await page.mouse.up();
  await expect(strip).toBeHidden();
  await expect(page.getByRole('log').getByRole('article').filter({ hasText: 'Голосовое сообщение.m4a' })).toBeVisible();
});
