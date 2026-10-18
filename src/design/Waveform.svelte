<!--
  Волна голосового — столбики на `<canvas>`, цвет — `currentColor`.

  `live` — то, что микрофон слышит сейчас: последние столбики у правого края, старые уезжают
  влево. Так полоса выглядит живым индикатором, а не графиком, который заполнился и встал.
  `fit` — вся запись по ширине; сыгранная часть (`progress`) — полным цветом, остальное бледнее.

  Канвас, а не ряд элементов: у него нет своей минимальной ширины, и в строке с часами и
  «Отменой» он берёт то, что осталось, — сколько столбиков влезло, столько и рисует.
-->
<script lang="ts">
  interface Props {
    samples: readonly number[];
    mode?: 'live' | 'fit';
    /** 0…1 — сколько сыграно (`fit`). */
    progress?: number;
  }
  let { samples, mode = 'live', progress = 1 }: Props = $props();

  /** Столбик и промежуток, CSS px — `Theme.Size.waveformBar` нативной. */
  const BAR = 2;
  const GAP = 2;
  const MIN_BAR = 3;
  const UNPLAYED_ALPHA = 0.4;

  let canvas: HTMLCanvasElement | undefined = $state();
  let width = $state(0);
  let height = $state(0);

  $effect(() => {
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width = entry.contentRect.width;
      height = entry.contentRect.height;
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  });

  /** Корзина `fit`: максимум, а не среднее, — короткое громкое слово не тонет. */
  function fitted(count: number): number[] {
    if (!samples.length || count <= 0) return [];
    return Array.from({ length: count }, (_, i) => {
      const start = Math.floor((i * samples.length) / count);
      const end = Math.max(start + 1, Math.floor(((i + 1) * samples.length) / count));
      let peak = 0;
      for (let j = start; j < end && j < samples.length; j++) peak = Math.max(peak, samples[j]!);
      return peak;
    });
  }

  $effect(() => {
    if (!canvas || !width || !height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = getComputedStyle(canvas).color;

    const step = BAR + GAP;
    const fitting = Math.max(0, Math.floor((width + GAP) / step));
    const bars = mode === 'live' ? samples.slice(-fitting) : fitted(fitting);
    const played = mode === 'fit' ? Math.round(progress * bars.length) : bars.length;
    bars.forEach((sample, index) => {
      // `live` — от правого края: новый звук стоит на месте, старый уезжает влево.
      const x = mode === 'live' ? width - (bars.length - index) * step + GAP : index * step;
      const bar = Math.max(MIN_BAR, Math.min(1, sample) * height);
      context.globalAlpha = index < played ? 1 : UNPLAYED_ALPHA;
      context.beginPath();
      context.roundRect(x, (height - bar) / 2, BAR, bar, BAR / 2);
      context.fill();
    });
  });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    min-width: 0;
    height: var(--size-waveform);
  }
</style>
