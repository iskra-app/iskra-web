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
      static isTypeSupported = (type: string) => type.startsWith('audio/mp4;codecs=') || type.startsWith('video/mp4;codecs=avc1');
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
    Object.defineProperty(mediaDevices, 'enumerateDevices', {
      configurable: true,
      value: async () => [{ kind: 'videoinput', deviceId: 'cam', label: 'Камера', groupId: '' }],
    });
    Object.defineProperty(mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        if (constraints.video) {
          // Камера — канвас, по которому ползёт полоса: кадры меняются, как у настоящей.
          const canvas = Object.assign(document.createElement('canvas'), { width: 640, height: 360 });
          const context = canvas.getContext('2d')!;
          let x = 0;
          setInterval(() => {
            context.fillStyle = '#336';
            context.fillRect(0, 0, 640, 360);
            context.fillStyle = '#fc6';
            context.fillRect((x += 8) % 640, 120, 80, 120);
          }, 33);
          return canvas.captureStream(30);
        }
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

/** Голосовые в ленте — пузыри с «Слушать». */
const voices = (page: Page) => page.getByRole('log').getByRole('article').filter({ has: page.getByRole('button', { name: /^(Слушать|Пауза)$/ }) });

async function openChat(page: Page) {
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await page.getByRole('link', { name: /^Выходные/ }).click();
  await expect(page.getByRole('log')).toBeVisible();
}

test('голосовое: Enter — запись без рук, «Отправить» — пузырь в ленте', async ({ page }) => {
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
  // Щелчок только переключает голосовое и «кружочек»; без рук — Enter.
  await record.focus();
  await page.keyboard.press('Enter');

  const strip = page.getByRole('group', { name: 'Запись голосового' });
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('0:01', { timeout: 5000 });
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(strip).toBeHidden();

  // Своё голосовое — пузырём с «▶» и длительностью, рядом с голосовым Веры из демо.
  await expect(voices(page)).toHaveCount(2);
  await expect(voices(page).last()).toContainText(/0:0\d/);
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
  await record.focus();
  await page.keyboard.press('Enter');
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
  await expect(voices(page)).toHaveCount(2);
});

test('голосовое в ленте: волна и длительность из события, «▶» — играет, пауза — встаёт', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openChat(page);
  const bubble = voices(page).first();
  await expect(bubble).toContainText('0:04');
  // Реакции от другого — Борису понравились фото озера и голосовое.
  const reactions = page.getByRole('log').getByRole('list', { name: 'Реакции' });
  await expect(reactions.filter({ hasText: '❤️' })).toHaveCount(1);
  await expect(reactions.filter({ hasText: '🔥' })).toHaveCount(1);
  await expect(bubble.locator('canvas')).toBeVisible();

  await bubble.getByRole('button', { name: 'Слушать' }).click();
  const pause = bubble.getByRole('button', { name: 'Пауза' });
  await expect(pause).toBeVisible();
  await pause.click();
  await expect(bubble.getByRole('button', { name: 'Слушать' })).toBeVisible();
  // Дослушали — снова «Слушать», с начала.
  await bubble.getByRole('button', { name: 'Слушать' }).click();
  await expect(pause).toBeVisible();
  await expect(bubble.getByRole('button', { name: 'Слушать' })).toBeVisible({ timeout: 8000 });
  await expect(bubble.getByRole('alert')).toHaveCount(0);
  if (process.env['VOICE_SHOT']) await bubble.screenshot({ path: process.env['VOICE_SHOT'] });
  expect(problems).toEqual([]);
});

test('«кружочек»: камера поверх комнаты, кольцо минуты, «Отправить» — круглое видео в ленте', async ({ page }, info) => {
  await fakeMicrophone(page);
  await signInToDemo(page);
  await openChat(page);
  const notes = page.getByRole('log').getByRole('button', { name: 'Видеосообщение' });
  await expect(notes).toHaveCount(0);

  // Кнопка одна — и на телефоне, и на десктопе: нажатие переключает голосовое и видео.
  if (isPhone(info.project.name)) await page.getByRole('button', { name: 'Записать голосовое' }).tap();
  else await page.getByRole('button', { name: 'Записать голосовое' }).click();
  await expect(page.getByRole('button', { name: 'Записать голосовое' })).toBeHidden();
  // Удержание — запись.
  const video = page.getByRole('button', { name: 'Записать видеосообщение' });
  await video.hover();
  const spot = (await video.boundingBox())!;
  await page.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2);
  await page.mouse.down();
  const camera = page.getByRole('dialog', { name: 'Видеосообщение' });
  await expect(camera).toBeVisible();
  const strip = camera.getByRole('group', { name: 'Запись видеосообщения' });
  await expect(strip).toContainText('0:01', { timeout: 5000 });
  // В кружке — тот самый канвас, который пишется: квадрат.
  const box = (await camera.locator('canvas').boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThan(2);

  // Увёл вверх — без рук, отправка кнопкой.
  await page.mouse.move(spot.x + spot.width / 2, spot.y - 100, { steps: 5 });
  await page.mouse.up();
  await camera.getByRole('button', { name: 'Отправить' }).click();
  await expect(camera).toBeHidden();
  await expect(notes).toHaveCount(1);
});

test('«кружочек»: «Отмена» и Esc — камера закрыта, ничего не ушло', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'Esc — путь десктопа');
  await fakeMicrophone(page);
  await signInToDemo(page);
  await openChat(page);
  await page.getByRole('button', { name: 'Записать голосовое' }).click();
  const record = page.getByRole('button', { name: 'Записать видеосообщение' });
  const camera = page.getByRole('dialog', { name: 'Видеосообщение' });
  await record.focus();
  await page.keyboard.press('Enter');
  await expect(camera.getByRole('button', { name: 'Отправить' })).toBeVisible();
  await camera.getByRole('button', { name: 'Отмена' }).click();
  await expect(camera).toBeHidden();

  await record.focus();
  await page.keyboard.press('Enter');
  await expect(camera.getByRole('button', { name: 'Отправить' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(camera).toBeHidden();
  await page.waitForTimeout(500);
  await expect(page.getByRole('log').getByRole('button', { name: 'Видеосообщение' })).toHaveCount(0);
});
