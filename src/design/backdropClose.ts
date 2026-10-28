/**
 * Щелчок по подложке закрывает окно. Подложка — часть самого `<dialog>`: щелчок по ней приходит
 * с `target === dialog`, но так же приходит щелчок по отступам окна, поэтому смотрим ещё и на
 * координаты. Нажатие должно начаться тоже снаружи: выделение текста, которое увели за край окна
 * и отпустили на подложке, окно не закрывает.
 */
export function backdropClose(dialog: HTMLDialogElement, close: () => void) {
  let handler = close;
  let pressedOutside = false;

  const outside = (event: MouseEvent): boolean => {
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };
  const onpointerdown = (event: PointerEvent) => {
    pressedOutside = event.target === dialog && outside(event);
  };
  const onclick = (event: MouseEvent) => {
    const closing = pressedOutside && event.target === dialog && outside(event);
    pressedOutside = false;
    if (closing) handler();
  };

  dialog.addEventListener('pointerdown', onpointerdown);
  dialog.addEventListener('click', onclick);
  return {
    update(next: () => void) {
      handler = next;
    },
    destroy() {
      dialog.removeEventListener('pointerdown', onpointerdown);
      dialog.removeEventListener('click', onclick);
    },
  };
}
