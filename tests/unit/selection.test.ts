import { describe, expect, it } from 'vitest';
import type { Message } from '../../src/core/timeline/message';
import { inTimelineOrder, isSelectable, selectionTranscript } from '../../src/core/timeline/selection';

function message(key: string, kind: Message['kind'], extra: Partial<Message> = {}): Message {
  return {
    key,
    eventId: `$${key}`,
    kind,
    senderId: '@a:x',
    senderName: 'Аня',
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

const stamp = () => '18.10.26, 12:00';

/** «Выбрать» — `MessageSelectionTests` нативной Искры. */
describe('выбор нескольких сообщений', () => {
  it('порядок — ленты, а не нажатий', () => {
    const messages = [message('a', { type: 'text', body: '1' }), message('b', { type: 'text', body: '2' }), message('c', { type: 'text', body: '3' })];
    expect(inTimelineOrder(messages, new Set(['c', 'a'])).map((m) => m.key)).toEqual(['a', 'c']);
  });

  it('одно — его слова; несколько — стенограмма: кто, когда, что', () => {
    const one = message('a', { type: 'text', body: '**Привет**', html: '<strong>Привет</strong>' });
    expect(selectionTranscript([one], stamp)).toBe('Привет');
    const two = message('b', { type: 'text', body: 'Как дела?' }, { senderName: 'Борис' });
    expect(selectionTranscript([one, two], stamp)).toBe('Аня, [18.10.26, 12:00]\nПривет\n\nБорис, [18.10.26, 12:00]\nКак дела?');
  });

  it('фото даёт подпись, без подписи — ничего', () => {
    const photo = (caption?: string) =>
      message('p', { type: 'image', attachment: { name: 'p.jpg', ...(caption ? { caption } : {}) } } as Message['kind']);
    expect(selectionTranscript([photo('Озеро')], stamp)).toBe('Озеро');
    expect(selectionTranscript([photo()], stamp)).toBeNull();
  });

  it('выбрать можно ушедшее, не удалённое и не служебное', () => {
    expect(isSelectable(message('a', { type: 'text', body: 'x' }))).toBe(true);
    expect(isSelectable(message('a', { type: 'deleted' }))).toBe(false);
    expect(isSelectable(message('a', { type: 'text', body: 'x' }, { eventId: undefined }))).toBe(false);
    expect(isSelectable(message('a', { type: 'text', body: 'x' }, { delivery: { state: 'failed', reason: 'server' } }))).toBe(false);
  });
});
