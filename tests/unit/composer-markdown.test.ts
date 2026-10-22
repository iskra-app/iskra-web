import { describe, expect, it } from 'vitest';
import { commonMark, markdownContent } from '../../src/core/timeline/composerMarkdown';
import { firstLineOf, htmlWords, wordsOf } from '../../src/core/timeline/words';

/** Те же случаи, что `ComposerMarkdownTests` нативной Искры. */
describe('Markdown в композере — как в мессенджерах', () => {
  it('одна звёздочка — жирный, подчёркивание — курсив', () => {
    expect(commonMark('*markdown* _test_')).toBe('**markdown** _test_');
  });

  it('что было жирным, остаётся жирным', () => {
    expect(commonMark('**жирный**')).toBe('**жирный**');
    expect(commonMark('***оба***')).toBe('***оба***');
  });

  it('звёздочки не парой не трогаются', () => {
    expect(commonMark('* пункт\n* ещё')).toBe('* пункт\n* ещё');
    expect(commonMark('2*3*4')).toBe('2*3*4');
    expect(commonMark('a * b * c')).toBe('a * b * c');
    expect(commonMark('*a*')).toBe('**a**');
  });

  it('код проходит как набран', () => {
    expect(commonMark('`*x*` и *y*')).toBe('`*x*` и **y**');
    expect(commonMark('```\n*x*\n```')).toBe('```\n*x*\n```');
  });

  it('обычный текст уходит без HTML, разметка — с ним', () => {
    expect(markdownContent('просто текст')).toEqual({ body: 'просто текст' });
    expect(markdownContent('две\nстроки')).toEqual({ body: 'две\nстроки' });
    expect(markdownContent('*важно* _кстати_')).toEqual({
      body: '**важно** _кстати_',
      format: 'org.matrix.custom.html',
      formatted_body: '<p><strong>важно</strong> <em>кстати</em></p>',
    });
  });

  it('перевод строки в разметке остаётся переводом, набранный HTML — текстом', () => {
    expect(markdownContent('*a*\nb').formatted_body).toBe('<p><strong>a</strong><br />b</p>');
    expect(markdownContent('*a* <script>x</script>').formatted_body).toBe('<p><strong>a</strong> &lt;script&gt;x&lt;/script&gt;</p>');
    expect(markdownContent('<div>\n*a*\n</div>').formatted_body).not.toContain('<div>');
  });

  it('превью — слова без значков', () => {
    expect(wordsOf('**markdown** _test_', '<strong>markdown</strong> <em>test</em>')).toBe('markdown test');
    expect(wordsOf('просто текст')).toBe('просто текст');
    expect(htmlWords('<mx-reply><blockquote>старое</blockquote></mx-reply>ответ &amp; всё')).toBe('ответ & всё');
    expect(firstLineOf('**a**\nb', '<p><strong>a</strong><br />b</p>')).toBe('a');
  });
});

describe('ссылки в разметке', () => {
  it('javascript: и data: уходят без адреса, https — как есть', () => {
    expect(markdownContent('[x](javascript:alert(1))').formatted_body).not.toContain('javascript');
    expect(markdownContent('[x](data:text/html,hi)').formatted_body).not.toContain('data:');
    expect(markdownContent('[x](https://example.org)').formatted_body).toContain('href="https://example.org"');
  });

  it('набранный тег по-прежнему уходит текстом', () => {
    expect(markdownContent('**a** <b>x</b>').formatted_body).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
