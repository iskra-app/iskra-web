<!--
  Что пошло не так — сказано так, чтобы это увидели. Урок нативной Искры: серая строчка
  под полем была самым тихим на экране, и люди вводили неверный пароль снова и снова.
  Красная, на своей панели, и объявляется скринридеру (`role="alert"`), а не просто есть.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from './icons.ts';
  let { title, message, detail }: { title?: string; message: string; detail?: string } = $props();
</script>

<div class="problem" role="alert">
  <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.warning} /></svg>
  <div>
    {#if title}<strong>{title}</strong>{/if}
    <p>{message}</p>
    {#if detail}<p class="detail">{detail}</p>{/if}
  </div>
</div>

<style>
  .problem {
    display: flex;
    gap: var(--space-close);
    align-items: flex-start;
    padding: var(--space-normal);
    border-radius: var(--radius-bubble);
    background: color-mix(in srgb, var(--color-danger) 12%, transparent);
    color: var(--color-danger);
    font-weight: 500;
  }
  svg {
    flex: none;
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
  strong {
    display: block;
    margin-block-end: var(--space-tight);
  }
  p {
    margin: 0;
  }
  .detail {
    margin-block-start: var(--space-tight);
    font-size: var(--font-size-caption);
    font-weight: 400;
    opacity: 0.8;
    overflow-wrap: anywhere;
  }
</style>
