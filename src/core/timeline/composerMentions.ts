/**
 * Упоминания через «@» — `ComposerMentions` нативной Искры: найти запрос, выбрать, кто под
 * него подходит, вставить имя и превратить выбранное в Matrix. Без разметки и без SDK — всё
 * можно спросить в тесте.
 *
 * В поле — простые слова, поэтому упоминание хранится рядом с черновиком, а не внутри: в тексте
 * `@Кай Го`, а запись говорит, какой это Кай. При отправке они сопоставляются снова, и имя,
 * которое стёрли или перепечатали, упоминанием быть перестаёт: правда — текст, запись только
 * говорит, что он значил.
 */

export interface ComposerMention {
  userId: string;
  name: string;
}

/** Что вставляется в поле и что ищется при отправке. */
export const tokenOf = (mention: ComposerMention): string => `@${mention.name}`;

/** «@…», который сейчас набирают: где он в черновике и что после «@». */
export interface MentionQuery {
  /** От «@» до курсора — то, что заменит выбранное имя. Индексы — UTF-16, как у `<textarea>`. */
  start: number;
  end: number;
  text: string;
}

/** Кого можно упомянуть: Matrix ID и имя. */
export interface MentionCandidate {
  id: string;
  name: string;
}

/** Кандидат в списке «@»: с лицом и пометкой, что имя в комнате не одно. */
export interface RankedCandidate extends MentionCandidate {
  avatarUrl?: string;
  /** В комнате есть ещё кто-то с этим именем — рядом показать Matrix ID. */
  ambiguous: boolean;
}

/**
 * Порядок списка «@»: кто писал последним — выше (тот, кому отвечают, почти всегда наверху),
 * дальше — в порядке комнаты. `senders` — авторы ленты от старых к новым.
 */
export function rankCandidates(
  people: Array<MentionCandidate & { avatarUrl?: string; disambiguate?: boolean }>,
  senders: readonly string[],
): RankedCandidate[] {
  const lastSpoke = (id: string) => {
    const at = senders.lastIndexOf(id);
    return at < 0 ? -Infinity : at;
  };
  const sameName = (name: string) => people.filter((p) => p.name === name).length > 1;
  return people
    .map((person, order) => ({ person, order, spoke: lastSpoke(person.id) }))
    .sort((a, b) => b.spoke - a.spoke || a.order - b.order)
    .map(({ person: { disambiguate, ...rest } }) => ({ ...rest, ambiguous: !!disambiguate || sameName(rest.name) }));
}

/** Длиннее запрос не бывает: сорок букв имени, чтобы найти его в списке, никто не набирает. */
const LONGEST_QUERY = 32;
const OPENERS = '([{«"\'';

/**
 * «@…», в конце которого стоит курсор. «@» считается только в начале текста или после
 * пробела и открывающей скобки — `boris@mail.ru` это адрес, а не зов. Запрос кончается на
 * пробеле: в именах пробелы есть, но сужать уже показанный список пробелом никто не станет.
 */
export function mentionQuery(text: string, cursor: number): MentionQuery | null {
  if (cursor > text.length) return null;
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  const typed = before.slice(at + 1);
  if ([...typed].length > LONGEST_QUERY || /[\s@]/u.test(typed)) return null;
  if (at > 0) {
    const previous = text[at - 1]!;
    if (!/\s/u.test(previous) && !OPENERS.includes(previous)) return null;
  }
  return { start: at, end: cursor, text: typed };
}

/** «kai» из «@kai:matrix.org». */
export function localpart(userId: string): string {
  const part = userId.startsWith('@') ? userId.slice(1) : userId;
  const colon = part.indexOf(':');
  return colon < 0 ? part : part.slice(0, colon);
}

/** Без регистра и диакритики, «ё» — как «е»: «@ё» находит Ёжика, «@e» — Эмиля с акцентом. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/ё/g, 'е');
}

/**
 * Кого запрос может значить. Подходит начало любого слова имени или начало своей части
 * Matrix ID: «@гу» находит Кая Гу, «@kai» — `@kai:matrix.org`, как бы он себя ни называл.
 * Порядок — данный (см. `mentionCandidates`: кто писал последним — выше).
 */
export function mentionMatches<T extends MentionCandidate>(query: string, members: T[]): T[] {
  const needle = fold(query);
  if (!needle) return members;
  return members.filter((member) => {
    const words = fold(member.name).split(/[\s\-.]+/u);
    if (words.some((word) => word.startsWith(needle))) return true;
    return fold(localpart(member.id)).startsWith(needle);
  });
}

/**
 * Черновик с именем на месте запроса и где после него курсор. За именем — пробел, чтобы
 * следующее слово набиралось сразу; если пробел там уже есть, курсор просто перешагивает его.
 */
export function insertMention(
  member: MentionCandidate,
  query: MentionQuery,
  text: string,
): { text: string; cursor: number; mention: ComposerMention } {
  const mention: ComposerMention = { userId: member.id, name: member.name };
  const head = text.slice(0, query.start);
  let tail = text.slice(query.end);
  if (!/^\s/u.test(tail)) tail = ` ${tail}`;
  const token = tokenOf(mention);
  return { text: head + token + tail, cursor: head.length + token.length + 1, mention };
}

const isWordCharacter = (character: string | undefined) => !!character && /[\p{L}\p{N}_]/u.test(character);

/** Имя — слова человека, и `*`, `_` или `]` в нём Markdown прочёл бы как разметку. */
function escaped(text: string): string {
  return text.replace(/[\\`*_[\]()<>#~|!]/g, '\\$&');
}
function unescaped(text: string): string {
  return text.replace(/\\(.)/gu, '$1');
}

/**
 * Черновик в Markdown, где каждое уцелевшее упоминание — ссылка `matrix.to`, и ID тех, кто
 * уцелел, — для `m.mentions`, который и будит человека. Нужны оба: ссылка без набора не
 * позовёт никого на нынешнем сервере, набор без ссылки покажет имя, которое не нажать.
 *
 * Упоминание уцелело, только если его `@Имя` всё ещё в тексте и не начало длинного слова:
 * `@Ann` не находится внутри `@Anna`. Поэтому длинные имена ставятся первыми.
 */
export function mentionsMarkdown(text: string, mentions: ComposerMention[]): { markdown: string; userIds: string[] } {
  const unique = [...new Map(mentions.map((m) => [`${m.userId}\n${m.name}`, m])).values()].sort(
    (a, b) => [...b.name].length - [...a.name].length,
  );
  if (unique.length === 0) return { markdown: text, userIds: [] };

  const found: Array<{ start: number; end: number; mention: ComposerMention }> = [];
  for (const mention of unique) {
    const token = tokenOf(mention);
    let from = 0;
    for (let at = text.indexOf(token, from); at >= 0; at = text.indexOf(token, from)) {
      const end = at + token.length;
      from = end;
      if (isWordCharacter(text[end]) || isWordCharacter(text[at - 1])) continue;
      if (found.some((f) => f.start < end && at < f.end)) continue;
      found.push({ start: at, end, mention });
    }
  }
  if (found.length === 0) return { markdown: text, userIds: [] };

  found.sort((a, b) => a.start - b.start);
  let markdown = '';
  let cursor = 0;
  const userIds: string[] = [];
  for (const { start, end, mention } of found) {
    markdown += text.slice(cursor, start);
    markdown += `[${escaped(tokenOf(mention))}](https://matrix.to/#/${mention.userId})`;
    cursor = end;
    if (!userIds.includes(mention.userId)) userIds.push(mention.userId);
  }
  return { markdown: markdown + text.slice(cursor), userIds };
}

const LINK = /\[((?:\\.|[^\]\\])+)\]\(https:\/\/matrix\.to\/#\/(@[^)\s]+)\)/gu;

/**
 * Обратно: своё сообщение — в композер для правки. Его тело — Markdown, каким оно было
 * написано, так что упоминание в нём — `[@Кай](https://matrix.to/#/@kai:…)`. В поле должно
 * снова стоять `@Кай`, а рядом — запись, чтобы правка тоже звала.
 */
export function unlinkMentions(markdown: string): { text: string; mentions: ComposerMention[] } {
  const mentions: ComposerMention[] = [];
  const text = markdown.replace(LINK, (whole, label: string, userId: string) => {
    const token = unescaped(label);
    if (!token.startsWith('@') || token.length < 2) return whole;
    const mention = { userId, name: token.slice(1) };
    if (!mentions.some((m) => m.userId === mention.userId && m.name === mention.name)) mentions.push(mention);
    return token;
  });
  return { text, mentions };
}
