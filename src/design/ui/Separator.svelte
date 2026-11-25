<script lang="ts">
  let { decorative = false }: { decorative?: boolean } = $props();
</script>

<hr data-slot="separator" aria-hidden={decorative || undefined} />

<style>
  hr {
    margin-block: var(--space-normal);
    border: 0;
    border-block-start: var(--border-hairline) solid var(--ui-border);
  }
</style>
