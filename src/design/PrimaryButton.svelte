<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from './ui/Button.svelte';
  interface Props {
    onclick?: () => void;
    type?: 'button' | 'submit';
    disabled?: boolean;
    /** Идёт работа: кнопка не нажимается, скринридер слышит «занято». */
    busy?: boolean;
    wide?: boolean;
    children: Snippet;
  }
  let { onclick, type = 'button', disabled = false, busy = false, wide = false, children }: Props = $props();
</script>

<Button {type} size={wide ? 'wide' : 'default'} {disabled} {busy} showSpinner {onclick} {children} />
