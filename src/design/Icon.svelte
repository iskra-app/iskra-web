<!--
  Иконка из `icons.ts` — Lucide, в разметке. Никаких шрифтов иконок с CDN.
  Обводка — `currentColor`, чтобы иконка брала цвет кнопки; толщина — `--icon-stroke`.
  Стилизовать `<svg>` из родителя — `:global(svg)`; `class` — только для `:global(.имя)`.
  Без `aria-label` иконка скрыта от чтения с экрана сама.
-->
<script lang="ts">
  import { filledIcons, icons, type IconName } from './icons.ts';

  interface Props {
    name: IconName;
    class?: string;
    role?: 'img';
    'aria-label'?: string;
  }
  let { name, class: className, role, 'aria-label': label }: Props = $props();
  const Glyph = $derived(icons[name]);
</script>

<Glyph fill={filledIcons.has(name) ? 'currentColor' : 'none'} class={className} {role} aria-label={label} />
