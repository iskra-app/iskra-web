import { describe, expect, it } from 'vitest';
import type { Poll } from '../../src/core/timeline/message';
import {
  canSendPoll,
  choiceAfterTapping,
  emptyPollDraft,
  isWinner,
  pollEndContent,
  pollStartContent,
  shareOf,
  showsResults,
  withAnswer,
  withoutAnswer,
} from '../../src/core/timeline/poll';

/** Опрос «Когда?» на три ответа; `votes` — ответ → сколько людей, `mine` — мой выбор. */
function poll(votes: Record<string, number>, mine: string[] = [], options: Partial<Poll> = {}): Poll {
  return {
    question: 'Когда?',
    answers: ['a', 'b', 'c'].map((id) => ({ id, text: id, votes: votes[id] ?? 0 })),
    voters: options.voters ?? Math.max(0, ...Object.values(votes)),
    mine,
    maxSelections: 1,
    undisclosed: false,
    ended: false,
    stable: false,
    ...options,
  };
}

/** Те же случаи, что `PollTests` нативной Искры. */
describe('опросы', () => {
  it('доли — от людей, а не от галочек', () => {
    const p = poll({ a: 2, b: 2 }, ['b'], { voters: 3, maxSelections: 3 });
    expect(shareOf(p, p.answers[0]!)).toBeCloseTo(2 / 3);
  });

  it('итоги — после своего голоса в открытом, в анонимном — только в конце', () => {
    expect(showsResults(poll({ a: 1 }))).toBe(false);
    expect(showsResults(poll({ a: 1 }, ['a']))).toBe(true);
    expect(showsResults(poll({ a: 1 }, ['a'], { undisclosed: true }))).toBe(false);
    expect(showsResults(poll({}, [], { undisclosed: true, ended: true }))).toBe(true);
  });

  it('победители — только в конце, ничья тоже', () => {
    const open = poll({ a: 1 });
    expect(isWinner(open, open.answers[0]!)).toBe(false);
    const over = poll({ a: 1, b: 1 }, [], { ended: true });
    expect(over.answers.map((a) => isWinner(over, a))).toEqual([true, true, false]);
    const empty = poll({}, [], { ended: true });
    expect(empty.answers.some((a) => isWinner(empty, a))).toBe(false);
  });

  it('нажатие меняет один ответ и ставит или снимает галочку — до предела', () => {
    const single = poll({ a: 1 }, ['a']);
    expect(choiceAfterTapping(single, 'b')).toEqual(['b']);
    expect(choiceAfterTapping(single, 'a')).toBeNull();
    const two = poll({ a: 1 }, ['a'], { maxSelections: 2 });
    expect(choiceAfterTapping(two, 'b')).toEqual(['a', 'b']);
    expect(choiceAfterTapping(two, 'a')).toEqual([]);
    const full = poll({ a: 1, b: 1 }, ['a', 'b'], { maxSelections: 2 });
    expect(choiceAfterTapping(full, 'c')).toBeNull();
    expect(choiceAfterTapping(poll({}, [], { ended: true }), 'a')).toBeNull();
  });

  it('черновику нужны вопрос и два ответа, пустые не считаются', () => {
    const draft = { ...emptyPollDraft(), question: '  ', answers: ['Да', 'Нет', ''] };
    expect(canSendPoll(draft)).toBe(false);
    expect(canSendPoll({ ...draft, question: 'Идём?' })).toBe(true);
    expect(canSendPoll({ ...draft, question: 'Идём?', answers: ['Да', '   ', ''] })).toBe(false);
  });

  it('набрали в последний вариант — под ним появляется пустой; меньше двух не убрать', () => {
    let draft = emptyPollDraft();
    draft = withAnswer(draft, 1, 'Нет');
    expect(draft.answers).toEqual(['', 'Нет', '']);
    draft = withAnswer(draft, 0, 'Да');
    expect(draft.answers).toEqual(['Да', 'Нет', '']);
    expect(withoutAnswer(draft, 2).answers).toEqual(['Да', 'Нет']);
    expect(withoutAnswer(withoutAnswer(draft, 2), 0).answers).toEqual(['Да', 'Нет']);
  });

  it('новый опрос — MSC3381, с текстом для клиентов без опросов', () => {
    const { type, content } = pollStartContent({ question: ' Идём? ', answers: ['Да', ' ', 'Нет'], multipleChoice: true, anonymous: true });
    expect(type).toBe('org.matrix.msc3381.poll.start');
    expect(content['org.matrix.msc1767.text']).toBe('Идём?\n1. Да\n2. Нет');
    expect(content['org.matrix.msc3381.poll.start']).toMatchObject({
      kind: 'org.matrix.msc3381.poll.undisclosed',
      max_selections: 2,
      question: { 'org.matrix.msc1767.text': 'Идём?' },
      answers: [
        { id: 'answer-1', 'org.matrix.msc1767.text': 'Да' },
        { id: 'answer-2', 'org.matrix.msc1767.text': 'Нет' },
      ],
    });
  });

  it('конец — в том же пространстве имён, что опрос', () => {
    expect(pollEndContent(poll({}, [], { stable: true }), '$p', 'Опрос завершён').type).toBe('m.poll.end');
    const unstable = pollEndContent(poll({}), '$p', 'Опрос завершён');
    expect(unstable.type).toBe('org.matrix.msc3381.poll.end');
    expect(unstable.content['m.relates_to']).toEqual({ rel_type: 'm.reference', event_id: '$p' });
  });
});
