/**
 * Где какая картинка альбома — мозаика Telegram (`AlbumMosaic` нативной), только из пропорций.
 *
 * Код Telegram читали, не копировали (GPL); взята идея. Альбом — не сетка одинаковых
 * квадратов, которая обрезает каждое фото в одну форму, а *строки*: каждая высотой ровно
 * такой, чтобы её картинки встали по ширине без обрезки. Свобода — только в том, как разбить
 * картинки по строкам. Перебираются все разбиения, и остаётся то, что ближе к приятной форме —
 * примерно квадрату, — без строк-щелей и с крупными картинками первыми: первое фото набора —
 * главное. Высокое первое фото рядом с двумя-тремя другими получает свой столбец.
 *
 * Чистая геометрия в долях ширины: ширина альбома — 1, высоты и отступы — в тех же долях.
 */

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Высота к ширине, к которой тянется альбом. */
const IDEAL_SHAPE = 1;
/** Больше четырёх в строке — уже полоска. */
const ROW_LIMIT = 4;

/**
 * `ratios` — ширина к высоте, по картинке на число, по порядку. `spacing` и `maxHeight` — в
 * долях ширины. Возвращает по рамке на картинку; высота альбома — нижний край самой нижней.
 */
export function mosaic(ratios: readonly number[], spacing: number, maxHeight: number): Frame[] {
  if (!ratios.length) return [];
  // Чек или панорама иначе утащили бы строку с собой — щель или строка во весь экран.
  const clamped = ratios.map((r) => Math.min(Math.max(Number.isFinite(r) && r > 0 ? r : 1, 0.5), 2.5));

  if (clamped.length === 1) return [{ x: 0, y: 0, width: 1, height: Math.min(1 / clamped[0]!, maxHeight) }];

  let best: { score: number; frames: Frame[] } | undefined;
  const consider = (frames: Frame[], penalty: number) => {
    const score = Math.abs(bottom(frames) - IDEAL_SHAPE) + penalty;
    if (!best || score < best.score) best = { score, frames };
  };
  for (const split of splits(clamped.length)) consider(rows(split, clamped, spacing), penaltyFor(split, clamped, spacing));
  if (clamped.length >= 2 && clamped.length <= 4 && clamped[0]! < 0.8) {
    const stacked = column(clamped, spacing);
    if (stacked) consider(stacked, 0);
  }
  return fitted(best?.frames ?? [], maxHeight);
}

export const bottom = (frames: readonly Frame[]): number => Math.max(0, ...frames.map((f) => f.y + f.height));

/** Все способы разрезать `count` картинок по порядку на строки от одной до `ROW_LIMIT`. */
export function splits(count: number): number[][] {
  if (count === 0) return [[]];
  const result: number[][] = [];
  for (let first = 1; first <= Math.min(ROW_LIMIT, count); first++) {
    for (const rest of splits(count - first)) result.push([first, ...rest]);
  }
  return result;
}

function heights(split: readonly number[], ratios: readonly number[], spacing: number): number[] {
  let start = 0;
  return split.map((count) => {
    const sum = ratios.slice(start, start + count).reduce((a, b) => a + b, 0);
    start += count;
    return (1 - spacing * (count - 1)) / sum;
  });
}

function rows(split: readonly number[], ratios: readonly number[], spacing: number): Frame[] {
  const rowHeights = heights(split, ratios, spacing);
  const frames: Frame[] = [];
  let y = 0;
  let start = 0;
  split.forEach((count, row) => {
    const height = rowHeights[row]!;
    let x = 0;
    for (let i = start; i < start + count; i++) {
      // Последняя в строке берёт то, что оставило округление: правый край ровный.
      const width = i === start + count - 1 ? 1 - x : ratios[i]! * height;
      frames.push({ x, y, width, height });
      x += width + spacing;
    }
    y += height + spacing;
    start += count;
  });
  return frames;
}

/**
 * Чем разбиение хуже, чем говорит его форма: строка тоньше четверти ширины — полоска; строка с
 * *бóльшим* числом картинок, чем следующая, — первые фото должны быть крупными; одинокая
 * картинка ниже первой строки — выдернута из набора (наверху она — обложка).
 */
function penaltyFor(split: readonly number[], ratios: readonly number[], spacing: number): number {
  let penalty = 0;
  for (const height of heights(split, ratios, spacing)) if (height < 1 / 4) penalty += 1;
  for (let i = 1; i < split.length; i++) if (split[i - 1]! > split[i]!) penalty += 0.2;
  if (ratios.length > 2) penalty += 0.1 * split.slice(1).filter((n) => n === 1).length;
  return penalty;
}

/** Первая картинка столбцом слева, остальные — стопкой рядом: для высокого первого фото. */
function column(ratios: readonly number[], spacing: number): Frame[] | undefined {
  const rest = ratios.slice(1);
  const inverse = rest.reduce((sum, r) => sum + 1 / r, 0);
  const stacked = spacing * (rest.length - 1);
  // Ширина столбца, при которой он и стопка выходят одной высоты.
  let left = ((1 - spacing) * inverse + stacked) / (1 / ratios[0]! + inverse);
  left = Math.min(Math.max(left, 0.4), 0.75);
  const right = 1 - spacing - left;
  const height = left / ratios[0]!;
  // Стопка делит высоту столбца пропорционально тому, сколько хочет каждая картинка.
  const wanted = rest.map((r) => right / r);
  const scale = (height - stacked) / wanted.reduce((a, b) => a + b, 0);
  if (scale <= 0) return undefined;
  const frames: Frame[] = [{ x: 0, y: 0, width: left, height }];
  let y = 0;
  wanted.forEach((want, i) => {
    const tile = i === wanted.length - 1 ? height - y : want * scale;
    frames.push({ x: left + spacing, y, width: right, height: tile });
    y += tile + spacing;
  });
  return frames;
}

/** Выше `maxHeight` — сжать по высоте: картинки чуть обрежутся, а альбом не убежит с экрана. */
function fitted(frames: Frame[], maxHeight: number): Frame[] {
  const height = bottom(frames);
  if (height <= maxHeight || height <= 0) return frames;
  const scale = maxHeight / height;
  return frames.map((f) => ({ ...f, y: f.y * scale, height: f.height * scale }));
}
