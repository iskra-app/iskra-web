<!--
  Искра со значка, плоская — `SparkGlyph` нативной: один цвет, без подложки и стекла. Контур —
  `icons/iskra-spark-flat.svg` нативной Искры точка в точку (747 × 731); глаза — дырки, поэтому
  заливка even-odd. Цвет — `currentColor`: какой нужен, решает место, где она стоит.
-->
<script lang="ts">
  // Размер задаёт ширина места, цвет — его `color`. `blinks` — раз в три секунды глаза закрываются
  // на 150 мс, как у `BlinkingSpark` нативной; с `prefers-reduced-motion` — не закрываются.
  import { SPARK_OUTLINE, SPARK_PATH, SPARK_VIEWBOX } from './spark';

  let { blinks = false }: { blinks?: boolean } = $props();
</script>

<svg class="spark" class:blinks viewBox={SPARK_VIEWBOX} aria-hidden="true">
  <path class="open" fill="currentColor" fill-rule="evenodd" d={SPARK_PATH} />
  {#if blinks}<path class="shut" fill="currentColor" d={SPARK_OUTLINE} />{/if}
</svg>

<style>
  .spark {
    display: block;
    width: 100%;
    height: auto;
  }
  /* Два кадра, а не один поверх другого: цвет полупрозрачный, и наложенные контуры дали бы
     искру темнее на время моргания. 150 мс из 3 с — последние 5 % цикла. */
  .shut {
    opacity: 0;
  }
  .blinks .open {
    animation: spark-open 3s step-end infinite;
  }
  .blinks .shut {
    animation: spark-shut 3s step-end infinite;
  }
  @keyframes spark-open {
    0% { opacity: 1; }
    95% { opacity: 0; }
  }
  @keyframes spark-shut {
    0% { opacity: 0; }
    95% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .blinks .open,
    .blinks .shut {
      animation: none;
    }
  }
</style>
