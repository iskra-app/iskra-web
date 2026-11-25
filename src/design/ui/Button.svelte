<script lang="ts" module>
  // Based on shadcn-svelte's Button (MIT). Variants use Iskra's semantic tokens.
  import { tv, type VariantProps } from 'tailwind-variants/lite';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  const buttonVariants = tv({
    base: 'ui-button inline-flex items-center justify-center gap-(--space-close) rounded-(--radius-control) press',
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'ui-button-secondary bg-secondary text-foreground',
        ghost: 'ui-button-ghost',
        destructive: 'bg-destructive text-destructive-foreground',
        'danger-quiet': 'ui-button-secondary bg-secondary text-destructive',
        link: 'ui-button-ghost text-link',
      },
      size: {
        default: 'px-(--space-roomy)',
        wide: 'ui-button-wide w-full px-(--space-roomy)',
        icon: 'ui-button-icon shrink-0',
        'icon-lg': 'ui-button-icon-lg shrink-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  });

  type Props = HTMLButtonAttributes & VariantProps<typeof buttonVariants> & {
    element?: HTMLButtonElement;
    busy?: boolean;
    showSpinner?: boolean;
  };
</script>

<script lang="ts">
  let {
    class: className,
    variant,
    size,
    element = $bindable(),
    busy = false,
    showSpinner = false,
    type = 'button',
    disabled,
    children,
    ...rest
  }: Props = $props();
</script>

<button
  bind:this={element}
  data-slot="button"
  class={[buttonVariants({ variant, size }), className]}
  {type}
  disabled={disabled || busy}
  aria-busy={busy || undefined}
  {...rest}
>
  {#if busy && showSpinner}<span class="spinner" aria-hidden="true"></span>{/if}
  {@render children?.()}
</button>

<style>
  .spinner {
    width: 1em;
    height: 1em;
    border: var(--border-thick) solid currentColor;
    border-inline-end-color: transparent;
    border-radius: var(--radius-circle);
    animation: spin var(--timing-spinner) linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(1turn); }
  }
</style>
