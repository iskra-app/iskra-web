<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from './ui/Button.svelte';
  import Tooltip from './ui/Tooltip.svelte';
  interface Props {
    label: string;
    /** Сочетание клавиш для тултипа, уже в виде для этой платформы: «Ctrl K» или «⌘K». */
    shortcut?: string;
    pressed?: boolean;
    expanded?: boolean;
    disabled?: boolean;
    element?: HTMLButtonElement;
    onclick: () => void;
    children: Snippet;
  }
  let { label, shortcut, pressed, expanded, disabled = false, element = $bindable(), onclick, children: icon }: Props = $props();
</script>

<Tooltip {label} {shortcut}>
  {#snippet children(title)}
    <Button variant="ghost" size="icon" bind:element aria-label={label} aria-pressed={pressed} aria-expanded={expanded} {disabled} {title} {onclick}>
      {@render icon()}
    </Button>
  {/snippet}
</Tooltip>
