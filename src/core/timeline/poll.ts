/**
 * Опрос глазами пузыря и черновик нового — `Poll` и `PollDraft` нативной Искры.
 *
 * Голоса считаются по людям, а не по галочкам: в опросе на два ответа три человека дают пять
 * голосов, и «60 %» должно значить «трое из пяти людей», а не «три из пяти галочек» — иначе
 * полосы опроса с несколькими ответами в сумме больше целого.
 */
import type { Poll, PollAnswer } from './message';

/**
 * Полосы видны, когда опрос закончен или — в открытом — когда ты уже ответил. До этого они
 * только подсказывали бы ответ, а в скрытом автор просил ничего не показывать до конца.
 */
export function showsResults(poll: Poll): boolean {
  return poll.ended || (!poll.undisclosed && poll.mine.length > 0);
}

/** Доля проголосовавших людей, выбравших ответ, 0…1. */
export function shareOf(poll: Poll, answer: PollAnswer): number {
  return poll.voters === 0 ? 0 : answer.votes / poll.voters;
}

/** Больше всех голосов — когда опрос закончен. Победителей может быть несколько. */
export function isWinner(poll: Poll, answer: PollAnswer): boolean {
  if (!poll.ended) return false;
  const most = Math.max(0, ...poll.answers.map((a) => a.votes));
  return most > 0 && answer.votes === most;
}

/**
 * Каким станет выбор после нажатия на ответ. В опросе на один ответ — меняется ответ (нажатие
 * на свой ничего не меняет: отзыв — отдельным пунктом меню). В опросе на несколько — галочка
 * ставится и снимается, и сверх `maxSelections` не ставится, а не снимает тайком прежнюю.
 * `null` — нажатие ничего не меняет.
 */
export function choiceAfterTapping(poll: Poll, answerId: string): string[] | null {
  if (poll.ended || !poll.answers.some((a) => a.id === answerId)) return null;
  const chosen = poll.mine;
  if (poll.maxSelections <= 1) return chosen.length === 1 && chosen[0] === answerId ? null : [answerId];
  if (chosen.includes(answerId)) return chosen.filter((id) => id !== answerId);
  if (chosen.length >= poll.maxSelections) return null;
  return [...chosen, answerId];
}

/** Опрос, который вот-вот уйдёт. */
export interface PollDraft {
  question: string;
  answers: string[];
  multipleChoice: boolean;
  /** Итоги скрыты до конца опроса. */
  anonymous: boolean;
}

/** Matrix разрешает двадцать, а опрос с большим числом — уже анкета, а не вопрос. */
export const MAX_POLL_ANSWERS = 20;

export const emptyPollDraft = (): PollDraft => ({ question: '', answers: ['', ''], multipleChoice: false, anonymous: false });

export function trimmedAnswers(draft: PollDraft): string[] {
  return draft.answers.map((a) => a.trim()).filter(Boolean);
}

export function canSendPoll(draft: PollDraft): boolean {
  return draft.question.trim() !== '' && trimmedAnswers(draft).length >= 2;
}

/**
 * Черновик с новым текстом ответа: набрали в последний — под ним появляется пустой, как в
 * Telegram, и кнопку «Добавить» для обычного случая искать не нужно.
 */
export function withAnswer(draft: PollDraft, index: number, text: string): PollDraft {
  if (index < 0 || index >= draft.answers.length) return draft;
  const answers = draft.answers.map((a, i) => (i === index ? text : a));
  if (index === answers.length - 1 && text !== '' && answers.length < MAX_POLL_ANSWERS) answers.push('');
  return { ...draft, answers };
}

/** Без ответа; меньше двух полей не бывает. */
export function withoutAnswer(draft: PollDraft, index: number): PollDraft {
  if (draft.answers.length <= 2 || index < 0 || index >= draft.answers.length) return draft;
  return { ...draft, answers: draft.answers.filter((_, i) => i !== index) };
}

/**
 * Содержимое `m.poll.start` в пространстве имён MSC3381 — его понимают все клиенты, которые
 * опросы вообще знают, и его же шлёт SDK нативной Искры. `body` — для тех, кто опросов не
 * знает: вопрос и варианты списком.
 */
export function pollStartContent(draft: PollDraft): { type: string; content: Record<string, unknown> } {
  const question = draft.question.trim();
  const answers = trimmedAnswers(draft).slice(0, MAX_POLL_ANSWERS);
  const fallback = [question, ...answers.map((a, i) => `${i + 1}. ${a}`)].join('\n');
  return {
    type: 'org.matrix.msc3381.poll.start',
    content: {
      'org.matrix.msc3381.poll.start': {
        kind: draft.anonymous ? 'org.matrix.msc3381.poll.undisclosed' : 'org.matrix.msc3381.poll.disclosed',
        max_selections: draft.multipleChoice ? answers.length : 1,
        question: { 'org.matrix.msc1767.text': question },
        answers: answers.map((text, i) => ({ id: `answer-${i + 1}`, 'org.matrix.msc1767.text': text })),
      },
      'org.matrix.msc1767.text': fallback,
    },
  };
}

/** Конец опроса — в том же пространстве имён, в каком он пришёл. `text` — для тех, кто опросов не знает. */
export function pollEndContent(poll: Poll, eventId: string, text: string): { type: string; content: Record<string, unknown> } {
  const relation = { 'm.relates_to': { rel_type: 'm.reference', event_id: eventId } };
  return poll.stable
    ? { type: 'm.poll.end', content: { ...relation, 'm.text': [{ body: text }] } }
    : { type: 'org.matrix.msc3381.poll.end', content: { ...relation, 'org.matrix.msc3381.poll.end': {}, 'org.matrix.msc1767.text': text } };
}
