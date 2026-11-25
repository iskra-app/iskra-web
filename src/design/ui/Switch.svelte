<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  let { checked = $bindable(false), ...attrs }: Omit<HTMLInputAttributes, 'type' | 'role'> = $props();
</script>

<input {...attrs} data-slot="switch" type="checkbox" role="switch" bind:checked />
