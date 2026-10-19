/**
 * Картинка для «Поделиться» — `QRCodeSheet.card` нативной: белое, код, имя и адрес под ним.
 * Читается где угодно, куда её отправят, в любой теме: QR-код на тёмном фоне камера может не
 * взять. Рисуется в `<canvas>` — без `innerHTML` и без сторонних шрифтов.
 */
import { qrModules } from './qr';
import { SPARK_HEIGHT, SPARK_PATH, SPARK_WIDTH } from './spark';

/** Размеры — в точках карточки, как у нативной: код 240, поля 24; рисуется втрое крупнее. */
const CODE = 240;
const PADDING = 24;
const GAP = 12;
const SCALE = 3;
const INK = '#000000';
const GROUND = '#ffffff';

/** Строку, которая не влезает, — с многоточием: имя бывает длинным, а карточка — нет. */
function fitted(context: CanvasRenderingContext2D, text: string, width: number): string {
  if (context.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && context.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

export function qrCard(link: string, name: string, subtitle: string): Promise<Blob | null> {
  const { size, dark, sparkFraction } = qrModules(link);
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const nameSize = 20;
  const subtitleSize = 15;
  const width = CODE + PADDING * 2;
  const height = PADDING + CODE + GAP + nameSize * 1.3 + GAP / 2 + subtitleSize * 1.3 + PADDING;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * SCALE);
  canvas.height = Math.round(height * SCALE);
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.scale(SCALE, SCALE);
  context.fillStyle = GROUND;
  context.fillRect(0, 0, width, height);

  const module = CODE / size;
  context.fillStyle = INK;
  dark.forEach((row, y) =>
    row.forEach((on, x) => {
      // Чуть внахлёст, чтобы между соседними модулями не просвечивала щель сглаживания.
      if (on) context.fillRect(PADDING + x * module, PADDING + y * module, module + 0.02, module + 0.02);
    }),
  );

  const side = CODE * sparkFraction;
  const sparkScale = side / Math.max(SPARK_WIDTH, SPARK_HEIGHT);
  context.save();
  context.translate(PADDING + (CODE - SPARK_WIDTH * sparkScale) / 2, PADDING + (CODE - SPARK_HEIGHT * sparkScale) / 2);
  context.scale(sparkScale, sparkScale);
  context.fill(new Path2D(SPARK_PATH), 'evenodd');
  context.restore();

  context.textAlign = 'center';
  context.textBaseline = 'top';
  let y = PADDING + CODE + GAP;
  context.font = `600 ${nameSize}px ${font}`;
  context.fillText(fitted(context, name, CODE), width / 2, y);
  y += nameSize * 1.3 + GAP / 2;
  context.font = `${subtitleSize}px ${font}`;
  context.globalAlpha = 0.6;
  context.fillText(fitted(context, subtitle, CODE), width / 2, y);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
