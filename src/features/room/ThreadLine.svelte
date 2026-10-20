<!--
  Строка под сообщением, на которое ответили в треде, — `ThreadLine` нативной: сколько ответов
  и кто сказал последний и что. Нажатие открывает тред. В цвете акцента, как ссылка: под
  пузырём это единственное, что куда-то ведёт.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import type { ThreadSummary } from '../../core/timeline/message';
  import { plural } from '../../i18n/index.svelte.ts';
  import { previewText } from '../rooms/text';

  let { thread, onopen }: { thread: ThreadSummary; onopen: () => void } = $props();

  const latest = $derived.by(() => {
    const text = thread.latest ? previewText(thread.latest) : '';
    if (thread.latestSender && text) return `${thread.latestSender}: ${text}`;
    return text;
  });
</script>

<button type="button" class="thread" onclick={onopen}>
  <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.forum} /></svg>
  <strong>{plural('thread.replies', thread.replies)}</strong>
  {#if latest}<span class="latest">{latest}</span>{/if}
  <svg class="chevron" viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.forward} /></svg>
</button>

<style>
  .thread {
    display: flex;
    align-items: center;
    gap: var(--space-tight);
    max-width: 100%;
    min-height: var(--size-unread-badge);
    padding: var(--space-tight) var(--space-close);
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: var(--font-size-caption);
    text-align: start;
    cursor: pointer;
  }
  @media (hover: hover) {
    .thread:hover {
      background: var(--color-selected);
    }
  }
  svg {
    flex: none;
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
  strong {
    flex: none;
    font-weight: 600;
  }
  .latest {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron {
    color: var(--color-text-secondary);
    opacity: 0.6;
  }
</style>
