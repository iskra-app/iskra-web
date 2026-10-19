import { describe, expect, it } from 'vitest';
import { commonMark } from '../../src/core/timeline/composerMarkdown';
import {
  insertMention,
  mentionMatches,
  mentionQuery,
  mentionsMarkdown,
  rankCandidates,
  unlinkMentions,
} from '../../src/core/timeline/composerMentions';

const query = (text: string) => mentionQuery(text, text.length);
const member = (id: string, name: string) => ({ id, name });

/** Список «@»: когда он спрашивает, кого находит и что уходит. Те же случаи, что `ComposerMentionsTests`. */
describe('упоминания через «@»', () => {
  it('«@» в начале или после пробела — спрашивает', () => {
    expect(query('@')?.text).toBe('');
    expect(query('привет @ка')?.text).toBe('ка');
    expect(query('(@kai')?.text).toBe('kai');
  });

  it('адрес — не упоминание', () => {
    expect(query('boris@mail')).toBeNull();
  });

  it('пробел заканчивает вопрос', () => {
    expect(query('@kai ')).toBeNull();
    expect(query('@kai guo')).toBeNull();
  });

  it('запрос — там, где курсор', () => {
    expect(mentionQuery('@kai and more', 4)?.text).toBe('kai');
  });

  it('подходит любое слово имени или начало ID', () => {
    const members = [member('@kai:matrix.org', 'Kai Guo'), member('@ezh:matrix.org', 'Ёжик'), member('@mx:matrix.org', 'Émile')];
    const ids = (q: string) => mentionMatches(q, members).map((m) => m.id);
    expect(ids('gu')).toEqual(['@kai:matrix.org']);
    expect(ids('KAI')).toEqual(['@kai:matrix.org']);
    expect(ids('еж')).toEqual(['@ezh:matrix.org']);
    expect(ids('emi')).toEqual(['@mx:matrix.org']);
    expect(ids('mx')).toEqual(['@mx:matrix.org']);
    expect(ids('')).toHaveLength(3);
  });

  it('выбор вставляет имя с пробелом', () => {
    const text = 'hi @ka';
    const { text: result, cursor, mention } = insertMention(member('@kai:m.org', 'Kai Guo'), query(text)!, text);
    expect(result).toBe('hi @Kai Guo ');
    expect(cursor).toBe(result.length);
    expect(mention).toEqual({ userId: '@kai:m.org', name: 'Kai Guo' });
  });

  it('уцелевшее упоминание становится ссылкой', () => {
    const { markdown, userIds } = mentionsMarkdown('hi @Kai Guo, see you', [{ userId: '@kai:m.org', name: 'Kai Guo' }]);
    expect(markdown).toBe('hi [@Kai Guo](https://matrix.to/#/@kai:m.org), see you');
    expect(userIds).toEqual(['@kai:m.org']);
  });

  it('стёртое упоминание никого не зовёт', () => {
    expect(mentionsMarkdown('hi Ka', [{ userId: '@kai:m.org', name: 'Kai' }])).toEqual({ markdown: 'hi Ka', userIds: [] });
  });

  it('короткое имя не находится внутри длинного', () => {
    const mentions = [
      { userId: '@ann:m.org', name: 'Ann' },
      { userId: '@anna:m.org', name: 'Anna' },
    ];
    expect(mentionsMarkdown('@Anna', mentions)).toEqual({ markdown: '[@Anna](https://matrix.to/#/@anna:m.org)', userIds: ['@anna:m.org'] });
  });

  it('разметка в имени экранируется и возвращается', () => {
    const mentions = [{ userId: '@x:m.org', name: '*star* [x]' }];
    const { markdown } = mentionsMarkdown('@*star* [x] hi', mentions);
    expect(markdown).toBe('[@\\*star\\* \\[x\\]](https://matrix.to/#/@x:m.org) hi');
    // Одиночные звёздочки остаются экранированными и после «жирного как в мессенджерах».
    expect(commonMark(markdown)).toBe(markdown);
    expect(unlinkMentions(markdown)).toEqual({ text: '@*star* [x] hi', mentions });
  });

  it('кто писал последним — выше, тёзки помечены', () => {
    const people = [member('@a:m', 'Аня'), member('@b:m', 'Боря'), member('@c:m', 'Аня'), member('@d:m', 'Дима')];
    const ranked = rankCandidates(people, ['@b:m', '@d:m', '@b:m', '@c:m']);
    expect(ranked.map((p) => p.id)).toEqual(['@c:m', '@b:m', '@d:m', '@a:m']);
    expect(ranked.filter((p) => p.ambiguous).map((p) => p.id)).toEqual(['@c:m', '@a:m']);
  });
});
