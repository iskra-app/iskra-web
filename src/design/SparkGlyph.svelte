<!--
  Искра со значка, плоская — `SparkGlyph` нативной: один цвет, без подложки и стекла. Контур —
  `icons/iskra-spark-flat.svg` нативной Искры точка в точку (747 × 731); глаза — дырки, поэтому
  заливка even-odd. Цвет — `currentColor`: какой нужен, решает место, где она стоит.
-->
<script lang="ts">
  // Свойств нет: размер задаёт ширина места, цвет — его `color`.
  import { SPARK_PATH, SPARK_VIEWBOX } from './spark';
</script>

<svg class="spark" viewBox={SPARK_VIEWBOX} aria-hidden="true">
  <path fill="currentColor" fill-rule="evenodd" d={SPARK_PATH} />
</svg>

<style>
  .spark {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
