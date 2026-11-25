import { router } from '../../core/navigation/router.svelte.ts';

const layerSelector = 'dialog[open], [data-panel-open="true"] > [data-back-layer]';

/** Нативные окна входят в верхний слой в порядке открытия, а не в порядке DOM. */
export function installOverlayHistory(touch: () => boolean, closePanel: () => void, focusFallback: () => void) {
  let layers: HTMLElement[] = [];

  function reconcile(records: MutationRecord[] = []) {
    const before = layers;
    const reopened = new Set(records.filter((record) => record.attributeName === 'open').map((record) => record.target));
    const current = [...document.querySelectorAll<HTMLElement>(layerSelector)];
    layers = before.filter((layer) => current.includes(layer) && !reopened.has(layer));
    for (const layer of current) if (!layers.includes(layer)) layers.push(layer);

    if (touch() && layers.length) router.showOverlay();
    else router.dismissOverlay();

    if (before.some((layer) => !layer.isConnected)) restoreFocus();
  }

  // Лента меняет DOM постоянно. Следим за слоями и за снятием уже открытого слоя.
  const observer = new MutationObserver((records) => {
    const stackChanged = records.some((record) => record.type === 'attributes') || layers.some((layer) => !layer.isConnected);
    const layerAdded = () => records.some((record) => Array.from(record.addedNodes).some((node) =>
      node instanceof HTMLElement && (node.matches(layerSelector) || node.querySelector(layerSelector))));
    if (stackChanged || layerAdded()) reconcile(records);
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open', 'data-panel-open', 'data-back-layer'],
  });

  function restoreFocus() {
    queueMicrotask(() => {
      if (!touch() && document.activeElement === document.body && !document.querySelector(layerSelector)) focusFallback();
    });
  }
  document.addEventListener('close', restoreFocus, true);

  router.onOverlayBack = () => {
    const top = layers.at(-1);
    if (top instanceof HTMLDialogElement && top.open) top.close();
    else if (top) closePanel();
  };
  reconcile();

  return {
    reconcile,
    destroy() {
      observer.disconnect();
      document.removeEventListener('close', restoreFocus, true);
      router.onOverlayBack = null;
      router.dismissOverlay();
    },
  };
}
