<!--
  Крестик в углу окна, которому `Dialog` не подходит. В разметке — последним: начальный фокус
  `showModal()` остаётся у содержимого, а не уходит к закрытию. Заголовку окна нужен отступ
  `--tap-target` со стороны крестика.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';

  let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<span class="close">
  <IconButton {label} {onclick}><Icon name="close" /></IconButton>
</span>

<style>
  /* Там же, где крестик `Dialog`: отступ окна минус запас кнопки — вровень с заголовком. */
  .close {
    position: absolute;
    inset-block-start: calc(var(--space-generous) - var(--space-close));
    inset-inline-end: calc(var(--space-generous) - var(--space-close));
  }
</style>
