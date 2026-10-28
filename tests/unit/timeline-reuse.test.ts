import { describe, expect, it } from 'vitest';
import { reuse, same } from '../../src/core/timeline/reuse';

describe('reuse: не изменившееся — прежними объектами', () => {
  it('same — по значению для простых данных, по ссылке для остального', () => {
    expect(same({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] })).toBe(true);
    expect(same({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(same([1, 2], [1, 2, 3])).toBe(false);
    expect(same(new Date(0), new Date(0))).toBe(false);
  });

  it('равная строка — прежний объект, изменившаяся — новый; ничего не изменилось — прежний список', () => {
    const before = [
      { key: 'a', text: 'раз', reactions: [{ key: '👍', count: 1 }] },
      { key: 'b', text: 'два', reactions: [] },
    ];
    const next = [
      { key: 'a', text: 'раз', reactions: [{ key: '👍', count: 2 }] },
      { key: 'b', text: 'два', reactions: [] },
      { key: 'c', text: 'три', reactions: [] },
    ];
    const result = reuse(before, next);
    expect(result[0]).not.toBe(before[0]);
    expect(result[1]).toBe(before[1]);
    expect(result[2]).toBe(next[2]);
    const again = reuse(result, result.map((m) => ({ ...m, reactions: m.reactions.map((r) => ({ ...r })) })));
    expect(again).toBe(result);
  });
});
