/**
 * Слова для поискового индекса — и для запроса к нему.
 *
 * Индекс ищет не по тексту, а по «отпечаткам» слов (`searchIndex.ts`), поэтому здесь решается,
 * что вообще может найтись. Как в нативной: без регистра и диакритики («ёлка» находит «Елка»),
 * по началу слова — «собр» находит «собрание», пока человек ещё печатает.
 *
 * Начала слов идут в индекс все, от двух букв до `PREFIX_LIMIT`: отпечаток не умеет «начинается
 * с», умеет только «равно». Длиннее — режется, и запрос режется так же; что найдено по
 * обрезанному, потом сверяется с расшифрованным текстом (`matches`).
 *
 * Письменности без пробелов (китайская, японская) делятся на пары знаков: «東京都» — это «東京»
 * и «京都», и запрос «京都» находит его, как найдёт и любой другой поиск по подстроке.
 */
import { fold } from '../rooms/organize';

/** Сколько первых букв слова идёт в индекс. */
export const PREFIX_LIMIT = 12;
/** Короче — не запрос: две буквы, как в нативной. */
export const MIN_QUERY = 2;

const WORD = /[\p{L}\p{N}]+/gu;
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function pairs(run: string): string[] {
  const chars = [...run];
  if (chars.length < 2) return [];
  const out: string[] = [];
  for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i]! + chars[i + 1]!);
  return out;
}

/** Слово делится на куски одной природы: «iPhone東京» — «iphone» и «東京». */
function pieces(word: string): Array<{ text: string; unspaced: boolean }> {
  const out: Array<{ text: string; unspaced: boolean }> = [];
  for (const char of word) {
    const unspaced = UNSPACED.test(char);
    const last = out.at(-1);
    if (last && last.unspaced === unspaced) last.text += char;
    else out.push({ text: char, unspaced });
  }
  return out;
}

/** Что положить в индекс: все начала каждого слова и пары знаков. Без повторов. */
export function termsOf(text: string): string[] {
  const terms = new Set<string>();
  for (const [word] of fold(text).matchAll(WORD)) {
    for (const piece of pieces(word)) {
      if (piece.unspaced) {
        for (const pair of pairs(piece.text)) terms.add(pair);
        continue;
      }
      const chars = [...piece.text];
      for (let length = MIN_QUERY; length <= Math.min(chars.length, PREFIX_LIMIT); length++) terms.add(chars.slice(0, length).join(''));
    }
  }
  return [...terms];
}

/**
 * Что спросить у индекса: у каждого слова запроса — само слово (обрезанное) или его пары.
 * Пусто — запрос слишком короткий, искать нечего.
 */
export function queryTerms(query: string): string[] {
  const trimmed = query.trim();
  if ([...trimmed].length < MIN_QUERY) return [];
  const terms = new Set<string>();
  for (const [word] of fold(trimmed).matchAll(WORD)) {
    for (const piece of pieces(word)) {
      const chars = [...piece.text];
      if (piece.unspaced) {
        if (chars.length === 1) continue;
        for (const pair of pairs(piece.text)) terms.add(pair);
      } else if (chars.length >= MIN_QUERY) {
        terms.add(chars.slice(0, PREFIX_LIMIT).join(''));
      }
    }
  }
  return [...terms];
}

/**
 * Сверка найденного с текстом: каждое слово запроса — начало какого-то слова сообщения (или,
 * у письменностей без пробелов, его подстрока). Нужна там, где отпечаток мог совпасть с
 * обрезанным, а целое слово — нет.
 */
export function matches(text: string, query: string): boolean {
  const words = [...fold(text).matchAll(WORD)].map(([word]) => word);
  for (const [asked] of fold(query.trim()).matchAll(WORD)) {
    if ([...asked].length < MIN_QUERY && !UNSPACED.test(asked)) continue;
    const found = UNSPACED.test(asked) ? words.some((word) => word.includes(asked)) : words.some((word) => word.startsWith(asked));
    if (!found) return false;
  }
  return true;
}
