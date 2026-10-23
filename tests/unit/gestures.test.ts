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

describe('два пальца по трекпаду: ответ свайпом вбок', () => {
  afterEach(() => vi.useRealTimers());

  /** Событие прокрутки трекпада: пикселями, без Ctrl. */
  function wheel(node: HTMLElement, deltaX: number, deltaY = 0): WheelEvent {
    const event = new WheelEvent('wheel', { deltaX, deltaY, deltaMode: 0, bubbles: true, cancelable: true });
    node.dispatchEvent(event);
    return event;
  }

  /** Сообщение: обёртка, которая едет, и пузырь в ней, над которым жест. */
  function message() {
    const carrier = document.createElement('div');
    carrier.setAttribute('data-swipe-carrier', '');
    const bubble = document.createElement('div');
    carrier.append(bubble);
    return { carrier, bubble };
  }

  it('вбок дальше порога — ответ; едет вся обёртка, а не один пузырь', () => {
    vi.useFakeTimers();
    const { carrier, bubble } = message();
    const h = handlers();
    touchGestures(bubble, h);
    // Пальцы вправо — отрицательный deltaX.
    expect(wheel(bubble, -30, 2).defaultPrevented).toBe(true);
    expect(carrier.style.transform).toBe('translateX(30px)');
    expect(bubble.style.transform).toBe('');
    wheel(bubble, -40);
    vi.advanceTimersByTime(200);
    expect(h.onswipe).toHaveBeenCalledOnce();
    expect(carrier.style.transform).toBe('');
  });

  it('не дотянули до порога — возвращается, ответа нет', () => {
    vi.useFakeTimers();
    const { carrier, bubble } = message();
    const h = handlers();
    touchGestures(bubble, h);
    wheel(bubble, -20);
    vi.advanceTimersByTime(200);
    expect(h.onswipe).not.toHaveBeenCalled();
    expect(carrier.style.transform).toBe('');
  });

  it('вертикаль остаётся ленте: не гасится и не тянет; влево — тоже не ответ', () => {
    vi.useFakeTimers();
    const { carrier, bubble } = message();
    const h = handlers();
    touchGestures(bubble, h);
    expect(wheel(bubble, 4, 40).defaultPrevented).toBe(false);
    expect(wheel(bubble, -50, 3).defaultPrevented).toBe(false);
    expect(carrier.style.transform).toBe('');
    vi.advanceTimersByTime(200);
    wheel(bubble, 80);
    vi.advanceTimersByTime(200);
    expect(h.onswipe).not.toHaveBeenCalled();
  });

  it('Ctrl + колесо (щипок) и колесо мыши строками — не жест', () => {
    const { bubble } = message();
    touchGestures(bubble, handlers());
    expect(bubble.dispatchEvent(new WheelEvent('wheel', { deltaX: -50, ctrlKey: true, cancelable: true }))).toBe(true);
    expect(bubble.dispatchEvent(new WheelEvent('wheel', { deltaX: -3, deltaMode: 1, cancelable: true }))).toBe(true);
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
