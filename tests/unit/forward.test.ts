import { describe, expect, it } from 'vitest';
import { canForward, forwardContent, forwardOriginOf } from '../../src/core/timeline/forward';
import type { Message } from '../../src/core/timeline/message';

function message(kind: Message['kind'], extra: Partial<Message> = {}): Message {
  return {
    key: 'k',
    eventId: '$e',
    kind,
    senderId: '@a:example.org',
    senderName: 'А',
    own: false,
    ts: 0,
    delivery: { state: 'sent' },
    edited: false,
    reactions: [],
    pinned: false,
    canEdit: false,
    canDelete: false,
    ...extra,
  };
}

/** Случаи `ForwardTests` нативной Искры. */
describe('пересылка', () => {
  it('слова, фото, видео и файлы — можно; удалённое и нечитаемое — нет', () => {
    expect(canForward(message({ type: 'text', body: 'hi' }))).toBe(true);
    expect(canForward(message({ type: 'notice', body: 'system' }))).toBe(true);
    expect(canForward(message({ type: 'emote', body: 'waves' }))).toBe(true);
    expect(canForward(message({ type: 'file', attachment: { name: 'a.txt', source: { mxc: 'mxc://x/a' } } }))).toBe(true);
    expect(canForward(message({ type: 'deleted' }))).toBe(false);
    expect(canForward(message({ type: 'unreadable' }))).toBe(false);
    // Не ушедшее — пересылать нечего.
    expect(canForward(message({ type: 'text', body: 'hi' }, { eventId: undefined }))).toBe(false);
  });

  it('пересылка говорит, что она пересылка, никого не называет и никого не зовёт', () => {
    const content = forwardContent(message({ type: 'text', body: 'hi' }))!;
    expect(content['body']).toBe('hi');
    expect(content['msgtype']).toBe('m.text');
    const forwarded = content['m.forwarded'] as Record<string, unknown>;
    // Ни кто написал, ни где.
    expect(forwarded['sender']).toBeUndefined();
    expect(forwarded['displayname']).toBeUndefined();
    expect(forwarded['event_id']).toBeUndefined();
    expect(forwarded['room_id']).toBeUndefined();
    expect((forwarded['content'] as Record<string, unknown>)['body']).toBe('hi');
    expect(content['m.mentions']).toEqual({});
    expect(forwardOriginOf(content)).toEqual({ ts: 0 });
  });

  it('пересылка пересланного не несёт автора оригинала и держит его время', () => {
    const forward = message({ type: 'text', body: 'hi' }, { ts: 5000, forwarded: { name: 'Первый', ts: 1000 } });
    const origin = forwardOriginOf(forwardContent(forward)!);
    expect(origin).toEqual({ ts: 1000 });
  });

  it('пометка с другого клиента: MSC2723, с именем или без', () => {
    expect(forwardOriginOf({ body: 'x', 'm.forwarded': { sender: '@b:x', origin_server_ts: 1000 } })).toEqual({ name: '@b:x', ts: 1000 });
    expect(forwardOriginOf({ body: 'x', 'm.forwarded': { sender: '@b:x', displayname: 'Боря' } })).toEqual({ name: 'Боря' });
    expect(forwardOriginOf({ body: 'x' })).toBeUndefined();
  });

  it('с пометкой уходят только слова', () => {
    expect(forwardContent(message({ type: 'deleted' }))).toBeNull();
  });
});
