/** В Safari клавиатура уменьшает видимую область, а не обязательно область раскладки. */
export function installMobileViewport(): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};

  const root = document.documentElement;
  const textField = 'textarea, input:not([type]), input:is([type="text"], [type="search"], [type="password"], [type="email"], [type="url"], [type="tel"], [type="number"])';
  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const focused = document.activeElement;
      const editable = focused instanceof HTMLElement && (focused.isContentEditable || focused.matches(textField));
      const keyboard = editable && viewport.scale === 1 && window.innerHeight - viewport.height > 100;
      root.toggleAttribute('data-keyboard-viewport', keyboard);
      if (keyboard) {
        root.style.setProperty('--app-viewport-height', `${viewport.height}px`);
        root.style.setProperty('--app-viewport-top', `${viewport.offsetTop}px`);
      }
    });
  };

  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', update);
  return () => {
    cancelAnimationFrame(frame);
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
    document.removeEventListener('focusin', update);
    document.removeEventListener('focusout', update);
    root.removeAttribute('data-keyboard-viewport');
    root.style.removeProperty('--app-viewport-height');
    root.style.removeProperty('--app-viewport-top');
  };
}
