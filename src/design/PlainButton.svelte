<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from './ui/Button.svelte';
  interface Props {
    onclick: () => void;
    disabled?: boolean;
    busy?: boolean;
    danger?: boolean;
    children: Snippet;
  }
  let { onclick, disabled = false, busy = false, danger = false, children }: Props = $props();
</script>

<Button variant={danger ? 'danger-quiet' : 'secondary'} size="wide" {disabled} {busy} {onclick} {children} />
