<!--
  «Что такое Matrix?» — `AboutMatrixView` нативной Искры: открывается мелкой ссылкой под
  кнопками входа, для того, кто это слово слышит впервые. Первый абзац крупнее — он и есть
  ответ; три блока под ним — почему это важно.
-->
<script lang="ts">
  import Dialog from '../../design/Dialog.svelte';
  import QuietButton from '../../design/QuietButton.svelte';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';

  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  const sections: Array<{ title: TextKey; body: TextKey }> = [
    { title: 'aboutMatrix.email.title', body: 'aboutMatrix.email.body' },
    { title: 'aboutMatrix.nobody.title', body: 'aboutMatrix.nobody.body' },
    { title: 'aboutMatrix.private.title', body: 'aboutMatrix.private.body' },
  ];
</script>

<Dialog {open} title={t('aboutMatrix.title')} {onclose}>
  <p class="intro">{t('aboutMatrix.intro')}</p>
  {#each sections as section (section.title)}
    <section>
      <h3>{t(section.title)}</h3>
      <p>{t(section.body)}</p>
    </section>
  {/each}
  <QuietButton onclick={onclose}>{t('recovery.close')}</QuietButton>
</Dialog>

<style>
  .intro {
    margin: 0;
    font-size: var(--font-size-title);
    font-weight: 500;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-close);
  }
  h3 {
    margin: 0;
    font-size: var(--font-size-body);
  }
  section p {
    margin: 0;
    color: var(--color-text-secondary);
  }
</style>
