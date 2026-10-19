<!--
  Полоса закреплённого над лентой — есть, только когда что-то закреплено. Нажатие ведёт к
  сообщению (подгружая историю, если надо); «Открепить» — тем, у кого есть право.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import { firstLineOf } from '../../core/timeline/words';
  import type { Message } from '../../core/timeline/message';
  import { t } from '../../i18n/index.svelte.ts';
  import { attachmentLabel } from './text';

  interface Props {
    message: Message | undefined;
    canUnpin: boolean;
    onjump: () => void;
    onunpin: () => void;
  }
  let { message, canUnpin, onjump, onunpin }: Props = $props();

  const text = $derived.by(() => {
    const kind = message?.kind;
    if (!kind) return t('reply.unavailable');
    if ('body' in kind) return firstLineOf(kind.body, 'html' in kind ? kind.html : undefined);
    if (kind.type === 'poll') return kind.poll.question;
    if (kind.type === 'deleted') return t('message.deleted');
    return attachmentLabel(kind);
  });
</script>

<div class="pinned">
  <button type="button" class="jump" aria-label={t('room.pinnedJump')} title={t('room.pinnedJump')} onclick={onjump} disabled={!message}>
    <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.pin} /></svg>
    <span class="what">
      <strong>{t('room.pinned')}</strong>
      <span class="text">{text}</span>
    </span>
  </button>
  {#if canUnpin && message}
    <button type="button" class="unpin" aria-label={t('room.unpin')} title={t('room.unpin')} onclick={onunpin}>
      <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.close} /></svg>
    </button>
  {/if}
</div>

<style>
  .pinned {
    display: flex;
    align-items: center;
    border-block-end: var(--border-hairline) solid var(--color-separator);
    background: var(--color-glass-opaque);
  }
  .jump {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    flex: 1;
    min-width: 0;
    min-height: var(--tap-target);
    padding: var(--space-tight) var(--timeline-gutter);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .jump:disabled {
    cursor: default;
  }
  svg {
    flex: none;
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
  .jump svg {
    color: var(--accent);
  }
  .what {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding-inline-start: var(--space-close);
    border-inline-start: 2px solid var(--accent);
    font-size: var(--font-size-caption);
  }
  strong {
    color: var(--accent);
  }
  .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .unpin {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--tap-target);
    height: var(--tap-target);
    margin-inline-end: var(--space-tight);
    border: none;
    border-radius: var(--radius-circle);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
  }
</style>
