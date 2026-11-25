<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  let { element = $bindable(), value = $bindable(''), class: className, ...attrs }:
    HTMLInputAttributes & { value?: string; element?: HTMLInputElement } = $props();
</script>

<input bind:this={element} bind:value {...attrs} data-slot="input" class={['ui-field', className]} />
