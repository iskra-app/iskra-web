import { describe, expect, it } from 'vitest';
import { arrivedFromOthers, layout, UNREAD_DIVIDER_KEY } from '../../src/core/timeline/layout';
import type { Message } from '../../src/core/timeline/message';

const T = Date.UTC(2026, 9, 18, 12);

function message(key: string, own = false, minutes = 0): Message {
  return {
    key,
    eventId: `$${key}`,
    kind: { type: 'text', body: '…' },
    senderId: own ? '@me:x' : '@a:x',
    senderName: own ? 'Я' : 'А',
    own,
    ts: T + minutes * 60_000,
    delivery: { state: 'sent' },
    edited: false,
    reactions: [],
    pinned: false,
    canEdit: own,
    canDelete: own,
  };
}

function joined(key: string): Message {
  return { ...message(key), kind: { type: 'service', event: { type: 'joined', people: ['А'] } } } as Message;
}

const keys = (items: ReturnType<typeof layout>) => items.filter((i) => i.kind !== 'day').map((i) => i.key);

/**
 * «Непрочитанные сообщения» — полоса, на которой открывается чат. Маркер SDK стоит за последним
 * *событием*, которое прочитано, и может оказаться над входом в чат, над пустотой или над своим
 * ответом с другого устройства, — полоса должна заслужить место. Случаи `UnreadDividerTests`.
 */
describe('полоса «Непрочитанные сообщения»', () => {
  it('стоит над чужим', () => {
    expect(keys(layout([message('a'), message('b')], 'b'))).toEqual(['a', UNREAD_DIVIDER_KEY, 'b']);
  });

  it('нет — когда маркер в самом конце', () => {
    expect(keys(layout([message('a')], undefined))).toEqual(['a']);
    expect(keys(layout([message('a')], 'нет-такого'))).toEqual(['a']);
  });

  it('нет — над одними своими словами и серыми строками', () => {
    expect(keys(layout([message('a'), joined('joined'), message('mine', true)], 'joined'))).not.toContain(UNREAD_DIVIDER_KEY);
  });

  it('есть — когда после своего ответа пришло чужое', () => {
    expect(keys(layout([message('mine', true), message('theirs')], 'mine'))[0]).toBe(UNREAD_DIVIDER_KEY);
  });

  it('рвёт серию, как дата', () => {
    const items = layout([message('a', false, 0), message('b', false, 1)], 'b');
    const b = items.find((i) => i.key === 'b');
    expect(b).toMatchObject({ kind: 'message', firstInRun: true });
  });
});

describe('число на кнопке «вниз»', () => {
  it('считает только чужое, пришедшее после последнего виденного', () => {
    const messages = [message('a'), message('mine', true), joined('j'), message('b'), message('c')];
    expect(arrivedFromOthers(messages, 'a')).toBe(2);
    expect(arrivedFromOthers(messages, 'c')).toBe(0);
    expect(arrivedFromOthers(messages, undefined)).toBe(0);
    expect(arrivedFromOthers(messages, 'пропал')).toBe(0);
  });
});
