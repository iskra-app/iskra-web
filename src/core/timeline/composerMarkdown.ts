/**
 * То, что набирают в композере, — в событие с `formatted_body`. `ComposerMarkdown` нативной
 * Искры и `messageEventContentFromMarkdown` её SDK.
 *
 * Звёздочка — как в мессенджерах. В CommonMark `*так*` и `_так_` — одно и то же, курсив, а
 * жирный — две звёздочки. Везде, где люди правда переписываются, одна звёздочка — **жирный**,
 * подчёркивание — курсив, и набирают именно так. Поэтому одна пара звёздочек становится
 * двумя до разбора, и больше ничего не трогается: `**так**` уже жирный; у пункта списка
 * (`* пункт`) после звёздочки пробел; `2*3*4` — арифметика; внутри кода звёздочка — звёздочка.
 */
import { HtmlRenderer, Parser, type Node } from 'commonmark';

/** Блок в тройных кавычках или код в строке — то, что проходит ровно как набрано. */
const CODE = /```[\s\S]*?```|`[^`\n]+`/g;
// `\w` нативной — юникодный: буква, цифра, подчёркивание.
const SINGLE_STARS = /(?<![*\\\p{L}\p{N}_])\*(?![\s*])([^*\n]*?[^\s*\\])\*(?![*\p{L}\p{N}_])/gu;

export function commonMark(text: string): string {
  let result = '';
  let last = 0;
  for (const code of text.matchAll(CODE)) {
    result += text.slice(last, code.index).replace(SINGLE_STARS, '**$1**');
    result += code[0];
    last = code.index + code[0].length;
  }
  return result + text.slice(last).replace(SINGLE_STARS, '**$1**');
}

const parser = new Parser();
// Перевод строки остаётся переводом: в переписке Enter — это новая строка, а не пробел.
const renderer = new HtmlRenderer({ softbreak: '<br />' });
// Человек пишет слова, а не разметку: набранное `<b>` уходит текстом `<b>`, а не тегом — и
// не исчезает, как в режиме `safe`, который заменяет его комментарием.
type Literal = { literal: string | null };
type Writer = { lit(text: string): void; esc(text: string): string; cr(): void };
const asText = function (this: Writer, node: Literal) {
  this.lit(this.esc(node.literal ?? ''));
};
Object.assign(renderer, {
  html_inline: asText,
  html_block(this: Writer, node: Literal) {
    this.cr();
    asText.call(this, node);
    this.cr();
  },
});

/** Только слова и переводы строк в одном абзаце — разметки нет, `formatted_body` не нужен. */
function isPlain(document: Node): boolean {
  const paragraph = document.firstChild;
  if (!paragraph || paragraph.next || paragraph.type !== 'paragraph') return !paragraph;
  for (let child = paragraph.firstChild; child; child = child.next) {
    if (child.type !== 'text' && child.type !== 'softbreak' && child.type !== 'linebreak') return false;
  }
  return true;
}

export interface TextContent {
  body: string;
  format?: 'org.matrix.custom.html';
  formatted_body?: string;
}

/**
 * Текст как содержимое события: `body` — набранное (с одной звёздочкой, превращённой в две),
 * `formatted_body` — его HTML, если в нём есть хоть какая-то разметка. Обычное сообщение
 * уходит без HTML, как и раньше.
 */
export function markdownContent(text: string): TextContent {
  const body = commonMark(text);
  const document = parser.parse(body);
  if (isPlain(document)) return { body };
  return { body, format: 'org.matrix.custom.html', formatted_body: renderer.render(document).trim() };
}
