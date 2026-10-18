// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { touchGestures } from '../../src/features/room/gestures';
import { CANCEL_PX, HOLD_MS, LOCK_PX, moveOf, releaseOf } from '../../src/features/room/recordGesture';

const handlers = () => ({ ondoubletap: vi.fn(), onswipe: vi.fn(), onlongpress: vi.fn() });

function rightClick(node: HTMLElement): Event {
  const event = new Event('contextmenu', { bubbles: true, cancelable: true });
  node.dispatchEvent(event);
  return event;
}

describe('жесты над сообщением: contextmenu', () => {
  afterEach(() => vi.restoreAllMocks());

  it('правый щелчок в первую секунду жизни страницы — не «дубль» долгого нажатия', () => {
    // performance.now() считается от загрузки страницы: сразу после неё он меньше секунды.
    vi.spyOn(performance, 'now').mockReturnValue(300);
    const node = document.createElement('div');
    const reached = vi.fn();
    node.addEventListener('contextmenu', reached);
    touchGestures(node, handlers());
    expect(rightClick(node).defaultPrevented).toBe(false);
    expect(reached).toHaveBeenCalledOnce();
  });

  it('contextmenu сразу после сработавшего долгого нажатия гасится', () => {
    vi.useFakeTimers();
    const node = document.createElement('div');
    const reached = vi.fn();
    node.addEventListener('contextmenu', reached);
    const h = handlers();
    touchGestures(node, h);
    const down = new Event('pointerdown') as PointerEvent;
    Object.assign(down, { pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10, pointerId: 1 });
    node.dispatchEvent(down);
    vi.advanceTimersByTime(600);
    expect(h.onlongpress).toHaveBeenCalledOnce();
    expect(rightClick(node).defaultPrevented).toBe(true);
    expect(reached).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('жест кнопки записи', () => {
  it('вверх — без рук, в сторону — отмена, мелкое дрожание — держит', () => {
    expect(moveOf(3, -5)).toBe('hold');
    expect(moveOf(-CANCEL_PX, 0)).toBe('cancel');
    expect(moveOf(CANCEL_PX, 0)).toBe('cancel');
    expect(moveOf(10, -LOCK_PX)).toBe('lock');
    // Наискосок — побеждает то, куда увели больше.
    expect(moveOf(-CANCEL_PX - 40, -LOCK_PX)).toBe('cancel');
    expect(moveOf(-CANCEL_PX, -CANCEL_PX - 10)).toBe('lock');
  });

  it('короткое нажатие — без рук, удержание — отправить', () => {
    expect(releaseOf(HOLD_MS - 1)).toBe('handsFree');
    expect(releaseOf(HOLD_MS)).toBe('send');
  });
});
