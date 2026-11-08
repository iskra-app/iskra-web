/**
 * Закрывающееся окно догорает с тем содержимым, что было, а не пустым. Содержимое меню и
 * подтверждений берётся из состояния, которое при закрытии обнуляется (`menu = null`), и
 * анимацию играла бы пустая рамка. Пока окно открыто, живое содержимое на месте; в миг
 * закрытия, до того как Svelte его уберёт, с него снимается копия — она и догорает, а живое
 * прячется. Копия неинтерактивна (`inert` у её хозяина) и скрыта от чтеца экрана.
 */
export function closingGhost(isOpen: () => boolean, live: () => HTMLElement | undefined, ghost: () => HTMLElement | undefined): void {
  let was = false;
  $effect.pre(() => {
    const open = isOpen();
    const from = live();
    const to = ghost();
    if (from && to) {
      if (was && !open) {
        to.replaceChildren(...from.cloneNode(true).childNodes);
        to.hidden = false;
        from.hidden = true;
      } else if (open && !was) {
        to.hidden = true;
        to.replaceChildren();
        from.hidden = false;
      }
    }
    was = open;
  });
}
