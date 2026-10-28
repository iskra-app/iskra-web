<!--
  Обрезка нового фото профиля или чата — `AvatarCropper` нативной: квадрат, в нём контур того,
  как фото будут показывать (круг или скруглённый квадрат пространства), а всё снаружи контура
  остаётся под тёмной вуалью — видно, что не войдёт и куда сдвинуть, чтобы вошло.

  Только сдвиг и масштаб: перетаскивание, щипок, колесо, ползунок; с клавиатуры — стрелки и `+`/`-`.
  Уходит сам квадрат, контур — только то, как его покажут (`avatarCrop.ts`).
-->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import { t } from '../../i18n/index.svelte.ts';
  import { clampOffset, displayedSize, MAX_ZOOM, renderCrop, zoomAt, type Crop, type Offset } from './avatarCrop';
  import { decodeImage } from './prepare';

  interface Props {
    /** Выбранный снимок; есть — окно открыто. */
    file: File | null;
    shape?: 'circle' | 'square';
    oncancel: () => void;
    ondone: (photo: Blob) => void;
  }
  let { file, shape = 'circle', oncancel, ondone }: Props = $props();

  /** Шаг стрелок — как у просмотрщика: заметно, но не прыжком. */
  const KEY_STEP = 16;

  let picture = $state<{ source: CanvasImageSource; width: number; height: number; url: string; release: () => void } | null>(null);
  let side = $state(0);
  let zoom = $state(1);
  let offset = $state<Offset>({ x: 0, y: 0 });
  let busy = $state(false);
  let img: HTMLImageElement | undefined = $state();

  const crop = $derived<Crop>({ image: picture ?? { width: 0, height: 0 }, side, zoom, offset });

  // Новый снимок — с начала: заполняет квадрат, по центру.
  $effect(() => {
    if (!file) return;
    let cancelled = false;
    let loaded: typeof picture = null;
    zoom = 1;
    offset = { x: 0, y: 0 };
    void decodeImage(file).then((decoded) => {
      const url = URL.createObjectURL(file);
      loaded = { ...decoded, url, release: () => (decoded.release(), URL.revokeObjectURL(url)) };
      if (cancelled) loaded.release();
      else picture = loaded;
    });
    return () => {
      cancelled = true;
      loaded?.release();
      picture = null;
    };
  });

  // Снимок едет за жестом без перерисовки разметки — как в просмотрщике.
  $effect(() => {
    if (!img || !picture) return;
    const shown = displayedSize(crop);
    img.style.width = `${shown.width}px`;
    img.style.height = `${shown.height}px`;
    img.style.transform = `translate(-50%, -50%) translate(${crop.offset.x}px, ${crop.offset.y}px)`;
  });

  function set(next: Crop) {
    zoom = next.zoom;
    offset = next.offset;
  }
  const moveBy = (dx: number, dy: number) => (offset = clampOffset(crop, { x: offset.x + dx, y: offset.y + dy }));

  // ————— Указатель: мышь и пальцы —————

  let hole: HTMLElement | undefined = $state();
  // Где сейчас пальцы — рабочая память жеста, не состояние экрана.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const pointers = new Map<number, Offset>();
  let pinchFrom: { distance: number; mid: Offset } | null = null;

  /** Точка от центра квадрата. */
  function fromCenter(x: number, y: number): Offset {
    const box = hole!.getBoundingClientRect();
    return { x: x - (box.left + box.width / 2), y: y - (box.top + box.height / 2) };
  }
  const both = () => [...pointers.values()] as [Offset, Offset];
  const distance = (a: Offset, b: Offset) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a: Offset, b: Offset) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function onpointerdown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = both();
      pinchFrom = { distance: distance(a, b), mid: midpoint(a, b) };
    }
  }

  function onpointermove(event: PointerEvent) {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      moveBy(event.clientX - last.x, event.clientY - last.y);
    } else if (pointers.size === 2 && pinchFrom) {
      const [a, b] = both();
      const mid = midpoint(a, b);
      // Пальцы разошлись — ближе к их середине; середина уехала — снимок за ней.
      const at = fromCenter(mid.x, mid.y);
      const zoomed = zoomAt(crop, (zoom * distance(a, b)) / pinchFrom.distance, at.x, at.y);
      set({ ...zoomed, offset: clampOffset(zoomed, { x: zoomed.offset.x + mid.x - pinchFrom.mid.x, y: zoomed.offset.y + mid.y - pinchFrom.mid.y }) });
      pinchFrom = { distance: distance(a, b), mid };
    }
  }

  function onpointerup(event: PointerEvent) {
    pointers.delete(event.pointerId);
    pinchFrom = null;
  }

  function onwheel(event: WheelEvent) {
    event.preventDefault();
    // Щипок трекпада приходит с `ctrlKey` и мелкими шагами; колесо мыши — без него и крупными.
    const k = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
    const at = fromCenter(event.clientX, event.clientY);
    set(zoomAt(crop, zoom * k, at.x, at.y));
  }

  function onkeydown(event: KeyboardEvent) {
    const moves: Record<string, [number, number]> = { ArrowLeft: [KEY_STEP, 0], ArrowRight: [-KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP] };
    const move = moves[event.key];
    if (move) moveBy(...move);
    else if (event.key === '+' || event.key === '=') set(zoomAt(crop, zoom * 1.25));
    else if (event.key === '-') set(zoomAt(crop, zoom / 1.25));
    else return;
    event.preventDefault();
  }

  async function done() {
    if (!picture) return;
    busy = true;
    try {
      const blob = await renderCrop(picture.source, crop);
      if (blob) ondone(blob);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog open={file !== null} title={t('avatarCrop.title')} onclose={oncancel}>
  <!-- Своё управление внутри — стрелки и `+`/`-`: скринридеру это `application`, а не картинка. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="stage"
    role="application"
    aria-label={t('avatarCrop.title')}
    tabindex="0"
    {onwheel}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    {onkeydown}
  >
    {#if picture}
      <img bind:this={img} src={picture.url} alt="" draggable="false" />
    {/if}
    <div class="hole" class:square={shape === 'square'} bind:this={hole} bind:clientWidth={side}></div>
  </div>
  <input
    type="range"
    min="1"
    max={MAX_ZOOM}
    step="0.01"
    value={zoom}
    aria-label={t('avatarCrop.zoom')}
    oninput={(event) => set(zoomAt(crop, Number(event.currentTarget.value)))}
  />
  <div class="actions">
    <PlainButton onclick={oncancel}>{t('avatarCrop.cancel')}</PlainButton>
    <PrimaryButton {busy} disabled={!picture} onclick={() => void done()}>{t('avatarCrop.done')}</PrimaryButton>
  </div>
</Dialog>

<style>
  .stage {
    position: relative;
    width: 100%;
    max-width: var(--size-avatar-cropper);
    aspect-ratio: 1;
    /* Окно — колонка: без этого невысокий экран сплющивает квадрат по высоте. */
    flex-shrink: 0;
    margin-inline: auto;
    overflow: hidden;
    border-radius: var(--radius-card);
    background: black;
    touch-action: none;
    cursor: grab;
    user-select: none;
  }
  .stage:active {
    cursor: grabbing;
  }
  img {
    position: absolute;
    top: 50%;
    left: 50%;
    max-width: none;
    pointer-events: none;
  }
  .hole {
    position: absolute;
    inset: var(--space-generous);
    border: var(--border-hairline) solid var(--color-crop-outline);
    border-radius: var(--radius-circle);
    box-shadow: 0 0 0 var(--size-crop-veil-spread) var(--color-crop-veil);
    pointer-events: none;
  }
  .hole.square {
    border-radius: 28%;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-close);
  }
</style>
