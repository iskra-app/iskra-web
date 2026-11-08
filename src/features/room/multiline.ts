/**
 * Сообщение в несколько строк — по строчным коробкам содержимого: у строчного элемента их по
 * одной на каждую строку текста. Следит за пузырём: ширина поменялась — строк стало больше или меньше.
 */
export function watchMultiline(node: HTMLElement, report: (multiline: boolean) => void) {
  const measure = () => {
    const lineHeight = parseFloat(getComputedStyle(node).fontSize) * 2;
    report(node.getClientRects().length > 1 || node.getBoundingClientRect().height > lineHeight);
  };
  measure();
  const watched = node.parentElement;
  if (!watched || typeof ResizeObserver === 'undefined') return {};
  const observer = new ResizeObserver(measure);
  observer.observe(watched);
  return { destroy: () => observer.disconnect() };
}
