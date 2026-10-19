/**
 * Слова сообщения без значков разметки — `MessagePreview.words` нативной Искры.
 *
 * Сообщение в Markdown несёт его дважды: HTML и сам Markdown в простом `body` — запасной
 * вариант для клиентов без форматирования. Его и показывали список чатов и цитата ответа:
 * `**важно**`, со звёздочками. Строчку жирной не сделать, но уроком синтаксиса она быть не
 * должна, поэтому где есть HTML — слова читаются из него. Заодно уходит `<mx-reply>`, цитата-
 * подпорка старых клиентов.
 *
 * Без DOM: это ядро, и строчке для списка хватает тегов, выброшенных регуляркой. На экран
 * этот текст попадает только как текст, никогда как разметка.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Текст из `formatted_body`: переводы строк — там, где их рисует HTML, остальное — слова. */
export function htmlWords(html: string): string {
  const text = html
    .replace(/<mx-reply>[\s\S]*?<\/mx-reply>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decode(text).replace(/\n{2,}/g, '\n').trim();
}

/** Слова сообщения: из HTML, если он есть, иначе — `body` как есть. */
export function wordsOf(body: string, html?: string): string {
  if (!html) return body;
  return htmlWords(html) || body;
}

/** Первая строка слов — для превью в одну строку. */
export function firstLineOf(body: string, html?: string): string {
  return wordsOf(body, html).split('\n')[0] ?? '';
}
