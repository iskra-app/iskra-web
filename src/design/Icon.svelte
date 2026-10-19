<!--
  Иконка из `icons.ts` — Material Symbols, в разметке. Никаких шрифтов иконок с CDN.
  Заливка — `currentColor`, чтобы иконка брала цвет кнопки.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons, type IconName } from './icons.ts';

  let { name }: { name: IconName } = $props();
</script>

<svg viewBox={ICON_VIEWBOX} fill="currentColor" aria-hidden="true">
  <path d={icons[name]} />
</svg>
