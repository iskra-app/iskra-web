<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  let { children, variant = 'secondary', class: className, ...attrs }:
    HTMLAttributes<HTMLSpanElement> & { variant?: 'primary' | 'secondary' | 'muted' } = $props();
</script>

<span {...attrs} data-slot="badge" class={['ui-badge', variant, className]}>{@render children?.()}</span>

<style>
  .ui-badge {
    display: inline-grid;
    place-items: center;
    min-width: var(--size-unread-badge);
    min-height: var(--size-unread-badge);
    border-radius: var(--radius-circle);
    background: var(--ui-secondary);
    color: var(--color-text);
    font-size: var(--font-size-caption);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .primary {
    background: var(--ui-primary);
    color: var(--ui-primary-foreground);
  }
  .muted {
    background: var(--color-muted-badge);
    color: var(--color-on-muted-badge);
  }
</style>
