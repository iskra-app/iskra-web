<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements';

  let { element = $bindable(), value = $bindable(''), class: className, ...attrs }:
    HTMLTextareaAttributes & { element?: HTMLTextAreaElement } = $props();
</script>

<textarea bind:this={element} bind:value {...attrs} data-slot="textarea" class={['ui-field', className]}></textarea>
