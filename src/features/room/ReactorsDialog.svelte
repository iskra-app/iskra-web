<!--
  Кто отреагировал и чем — `ReactorsSheet` нативной. Открывается в группе из «N реакций» в меню
  сообщения и правым щелчком или удержанием на самой реакции — сразу на её эмодзи: в личном чате
  вопрос отвечает сам на себя. Сверху — «Все», потом по
  эмодзи с числом; ниже — люди. На стекле, без карточки: простой список на самом окне.
-->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import type { Reactor } from '../../core/timeline/timelineStore.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { plural, t } from '../../i18n/index.svelte.ts';
  import ReactorRow from './ReactorRow.svelte';

  interface Props {
    /** `null` — окно закрыто. */
    reactors: Reactor[] | null;
    /** На какой эмодзи открыть; `null` — «Все». */
    initialFilter?: string | null;
    session: UserSession;
    onclose: () => void;
  }
  let { reactors, initialFilter = null, session, onclose }: Props = $props();

  /** Какой эмодзи показан; `null` — все. Открылось заново — снова с того, с чего просили. */
  let filter = $derived(reactors ? initialFilter : null);

  const keys = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const r of reactors ?? []) counts[r.key] = (counts[r.key] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  });
  const shown = $derived((reactors ?? []).filter((r) => filter === null || r.key === filter));
</script>

<Dialog glass closeLabel={t('recovery.close')} open={!!reactors} title={plural('message.menu.reactors', reactors?.length ?? 0)} {onclose}>
  {#if reactors}
    <div class="tabs" role="radiogroup" aria-label={plural('message.menu.reactors', reactors.length)}>
      <button type="button" role="radio" aria-checked={filter === null} onclick={() => (filter = null)}>
        {t('message.menu.reactorsAll', { count: reactors.length })}
      </button>
      {#each keys as [key, count] (key)}
        <button type="button" role="radio" aria-checked={filter === key} onclick={() => (filter = key)}>{key} {count}</button>
      {/each}
    </div>
    <ul class="list">
      {#each shown as reactor, i (`${reactor.userId}-${reactor.key}-${i}`)}
        <ReactorRow {reactor} {session} />
      {/each}
    </ul>
  {/if}
</Dialog>

<style>
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-tight);
  }
  .tabs button {
    min-height: var(--tap-target);
    padding: 0 var(--space-normal);
    border: none;
    border-radius: var(--radius-circle);
    background: var(--color-surface);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .tabs button[aria-checked='true'] {
    background: var(--accent);
    color: var(--on-accent);
  }
  .list {
    margin: 0;
    min-height: 0;
    padding: 0;
    list-style: none;
    /* Прокручивается список, а не окно: шапка на стекле прозрачная, и строки шли бы сквозь заголовок. */
    overflow-y: auto;
  }
</style>
