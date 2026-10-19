<!--
  Сам код — `QRCodeImage` нативной: чёрным по белому при любой теме, на белой карточке. Камера
  читает тёмные модули на светлом, а инвертированный код половина сканеров мира не берёт.
  Модули — квадратами (`crispEdges`): размытый код камера читает хуже, и выглядит он неправильно
  задолго до того, как перестаёт читаться. Искра — чёрная, как модули, в квадрате, оставленном
  ей `qr.ts`.
-->
<script lang="ts">
  import { qrModules, qrPath } from './qr';
  import { SPARK_HEIGHT, SPARK_PATH, SPARK_WIDTH } from './spark';

  let { text }: { text: string } = $props();

  const modules = $derived(qrModules(text));
  const path = $derived(qrPath(modules));
  /** Искра в модулях кода: вписана в свой квадрат по большей стороне и стоит по центру. */
  const spark = $derived.by(() => {
    const side = modules.size * modules.sparkFraction;
    const scale = side / Math.max(SPARK_WIDTH, SPARK_HEIGHT);
    const x = (modules.size - SPARK_WIDTH * scale) / 2;
    const y = (modules.size - SPARK_HEIGHT * scale) / 2;
    return `translate(${x} ${y}) scale(${scale})`;
  });
</script>

<span class="card" aria-hidden="true">
  <svg viewBox="0 0 {modules.size} {modules.size}" shape-rendering="crispEdges">
    <path d={path} />
    <path d={SPARK_PATH} fill-rule="evenodd" transform={spark} shape-rendering="geometricPrecision" />
  </svg>
</span>

<style>
  .card {
    display: block;
    width: 100%;
    max-width: var(--size-qr-code);
    padding: var(--space-roomy);
    border-radius: var(--radius-card);
    background: var(--color-qr-ground);
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    fill: var(--color-qr-ink);
  }
</style>
