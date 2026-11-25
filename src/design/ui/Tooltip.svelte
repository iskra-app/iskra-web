<script lang="ts" module>
  // Browser tooltip stays in the top layer and outside overflow clipping, including native dialogs.
  export function tooltipText(label: string, shortcut?: string): string {
    return shortcut ? `${label} (${shortcut})` : label;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  let { label, shortcut, children }: {
    label: string;
    shortcut?: string;
    children: Snippet<[string]>;
  } = $props();
</script>

{@render children(tooltipText(label, shortcut))}
