/**
 * QR-код — `QRCode` нативной Искры: коррекция `H` и чистый квадрат посередине под искру.
 *
 * `H`, и искра — тому причина. Код на экране виден целиком и резко, ему хватило бы и `M`, но
 * середина этого закрыта нарочно, а `H` восстанавливает до 30 % кода по остальному. Вырезанный
 * квадрат — меньше десятой, остальной запас — экрану с бликом.
 *
 * Квадрат — нечётного числа модулей: код всегда нечётной ширины, и нечётный квадрат по центру
 * начинается и кончается на границе модуля, а не посередине. Полмодуля, торчащие у края
 * подложки, — то, из-за чего логотип на QR-коде выглядит наклеенным.
 */
import { encode } from 'uqr';

export interface QrModules {
  /** Сколько модулей в стороне — без полей. */
  size: number;
  /** Тёмные модули, строка за строкой. Середина уже очищена. */
  dark: boolean[][];
  /** Искра — доля стороны: чистый квадрат минус модуль белого с каждой стороны. */
  sparkFraction: number;
}

/** Сколько модулей в чистом квадрате кода шириной `width`: чуть больше четверти, нечётное. */
export function centreSize(width: number): number {
  const size = Math.round(width * 0.28);
  return size % 2 === 0 ? size + 1 : size;
}

export function qrModules(text: string): QrModules {
  const { data, size } = encode(text, { ecc: 'H', border: 0 });
  const centre = centreSize(size);
  const from = (size - centre) / 2;
  const dark = data.map((row, y) => row.map((on, x) => on && !(x >= from && x < from + centre && y >= from && y < from + centre)));
  return { size, dark, sparkFraction: (centre - 2) / size };
}

/** Тёмные модули одним путём SVG: подряд идущие в строке — одним прямоугольником. */
export function qrPath({ dark }: QrModules): string {
  let path = '';
  dark.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      path += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  });
  return path;
}
