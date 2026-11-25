<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from './ui/Button.svelte';
  let { onclick, disabled = false, children }: { onclick: () => void; disabled?: boolean; children: Snippet } = $props();
</script>

<Button variant="link" {disabled} {onclick} {children} />
