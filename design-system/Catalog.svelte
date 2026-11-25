<script lang="ts">
  import Button from '$design/ui/Button.svelte';
  import Input from '$design/ui/Input.svelte';
  import Textarea from '$design/ui/Textarea.svelte';
  import Switch from '$design/ui/Switch.svelte';
  import Checkbox from '$design/ui/Checkbox.svelte';
  import Badge from '$design/ui/Badge.svelte';
  import Separator from '$design/ui/Separator.svelte';
  import Icon from '$design/Icon.svelte';
  import IconButton from '$design/IconButton.svelte';
  import SparkGlyph from '$design/SparkGlyph.svelte';
  import ConfirmDialog from '$design/ConfirmDialog.svelte';
  import { t } from '../src/i18n/index.svelte.ts';
  import { accents } from '../src/features/app/preferences.svelte.ts';

  let { locale }: { locale: 'ru' | 'en' } = $props();

  const strings = {
    ru: {
      title: 'Дизайн-система', theme: 'Тема', accent: 'Акцент', density: 'Указатель',
      light: 'Светлая', dark: 'Тёмная', system: 'Системная', mouse: 'Мышь', touch: 'Касание',
      actions: 'Действия', fields: 'Поля и выбор', feedback: 'Статусы', overlays: 'Диалоги',
      send: 'Отправить', reply: 'Ответить', more: 'Ещё', clear: 'Удалить', back: 'Назад',
      pending: 'Ожидание', off: 'Недоступно', attach: 'Вложить', search: 'Поиск по чатам',
      address: 'Имя сервера', value: 'matrix.example.org', correction: 'Введите адрес сервера',
      note: 'Сообщение', notifications: 'Уведомления', remember: 'Запомнить выбор',
      unread: 'Непрочитано', muted: 'Без звука', draft: 'Черновик', empty: 'Сообщений пока нет',
      confirm: 'Удалить черновик?', detail: 'Набранный текст будет удалён.', cancel: 'Отмена', close: 'Закрыть',
    },
    en: {
      title: 'Design system', theme: 'Theme', accent: 'Accent', density: 'Pointer',
      light: 'Light', dark: 'Dark', system: 'System', mouse: 'Mouse', touch: 'Touch',
      actions: 'Actions', fields: 'Fields and choice', feedback: 'Status', overlays: 'Dialogs',
      send: 'Send', reply: 'Reply', more: 'More', clear: 'Delete', back: 'Back',
      pending: 'Pending', off: 'Unavailable', attach: 'Attach', search: 'Search chats',
      address: 'Server name', value: 'matrix.example.org', correction: 'Enter a server address',
      note: 'Message', notifications: 'Notifications', remember: 'Remember selection',
      unread: 'Unread', muted: 'Muted', draft: 'Draft', empty: 'No messages yet',
      confirm: 'Delete the draft?', detail: 'The text you entered will be deleted.', cancel: 'Cancel', close: 'Close',
    },
  };
  const c = $derived(strings[locale]);
  let theme = $state<'system' | 'light' | 'dark'>('system');
  let accent = $state<(typeof accents)[number]>('blue');
  let density = $state<'system' | 'mouse' | 'touch'>('system');
  let draft = $state('');
  let enabled = $state(true);
  let remembered = $state(false);
  let sampleInput: HTMLInputElement | undefined = $state();
  let confirming = $state(false);

  $effect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    if (density === 'system') delete root.dataset.catalogPointer;
    else root.dataset.catalogPointer = density;
    root.dataset.accent = accent;
  });
</script>

<main class="catalog">
  <header>
    <span class="brand"><SparkGlyph /> Iskra</span>
    <h1>{c.title}</h1>
    <div class="filters">
      <label>{c.theme}
        <select bind:value={theme}>
          <option value="system">{c.system}</option>
          <option value="light">{c.light}</option>
          <option value="dark">{c.dark}</option>
        </select>
      </label>
      <label>{c.accent}
        <select bind:value={accent}>
          {#each accents as color (color)}<option value={color}>{t(`appearance.color.${color}`)}</option>{/each}
        </select>
      </label>
      <label>{c.density}
        <select bind:value={density}>
          <option value="system">{c.system}</option>
          <option value="mouse">{c.mouse}</option>
          <option value="touch">{c.touch}</option>
        </select>
      </label>
    </div>
  </header>

  <div class="examples">
    <section>
      <h2>{c.actions}</h2>
      <div class="preview">
        <Button>{c.send}</Button>
        <Button variant="secondary">{c.reply}</Button>
        <Button variant="link">{c.back}</Button>
        <Button variant="destructive" onclick={() => (confirming = true)}>{c.clear}</Button>
        <Button busy showSpinner>{c.pending}</Button>
        <Button disabled>{c.off}</Button>
        <IconButton label={c.search} shortcut="⌘K" onclick={() => sampleInput?.focus()}>
          <Icon name="search" />
        </IconButton>
        <IconButton label={c.more} pressed={enabled} onclick={() => (enabled = !enabled)}>
          <Icon name="more" />
        </IconButton>
      </div>
    </section>
    <section>
      <h2>{c.fields}</h2>
      <div class="fields">
        <label for="example-input">{c.address}</label>
        <Input bind:element={sampleInput} id="example-input" placeholder={c.value} />
        <Input aria-label={c.correction} placeholder={c.correction} aria-invalid="true" />
        <Input aria-label={c.off} value={c.value} disabled />
        <label for="example-textarea">{c.note}</label>
        <Textarea id="example-textarea" bind:value={draft} rows={3} placeholder={c.note} />
        <label class="toggle"><Switch bind:checked={enabled} />{c.notifications}</label>
        <label class="toggle"><Checkbox bind:checked={remembered} />{c.remember}</label>
      </div>
    </section>
    <section>
      <h2>{c.feedback}</h2>
      <div class="preview">
        <Badge variant="primary" class="status">{c.unread}</Badge>
        <Badge variant="muted" class="status">{c.muted}</Badge>
        <Badge class="status">{c.draft}</Badge>
      </div>
      <Separator />
      <p class="empty">{c.empty}</p>
    </section>
    <section>
      <h2>{c.overlays}</h2>
      <Button variant="secondary" onclick={() => (confirming = true)}>{c.confirm}</Button>
    </section>
  </div>
</main>

<ConfirmDialog
  open={confirming}
  title={c.confirm}
  message={c.detail}
  cancelLabel={c.cancel}
  confirmLabel={c.clear}
  closeLabel={c.close}
  destructive
  onclose={() => (confirming = false)}
  onconfirm={() => { draft = ''; confirming = false; }}
/>

<style>
  :global(html[data-catalog-pointer='mouse']) { --tap-target: var(--tap-target-mouse); }
  :global(html[data-catalog-pointer='touch']) { --tap-target: var(--tap-target-touch); }
  .catalog {
    max-inline-size: 66rem;
    margin-inline: auto;
    padding: clamp(var(--space-roomy), 5vw, 4rem);
  }
  header {
    padding-block-end: var(--space-generous);
    border-block-end: var(--border-hairline) solid var(--color-separator);
  }
  .brand, .toggle {
    display: flex;
    align-items: center;
    gap: var(--space-close);
  }
  .brand {
    font-weight: 600;
    color: var(--ui-link);
  }
  .brand :global(svg) {
    inline-size: var(--size-icon);
    block-size: var(--size-icon);
  }
  h1 {
    margin-block: var(--space-normal) var(--space-generous);
    font-size: var(--font-size-large-title);
  }
  h2 {
    margin-block: 0 var(--space-roomy);
    font-size: var(--font-size-title);
  }
  .filters, .preview {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-close);
  }
  .filters label {
    display: grid;
    gap: var(--space-tight);
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  select {
    min-block-size: var(--tap-target);
    padding-inline: var(--space-close);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-control);
    color: var(--color-text);
    background: var(--color-surface);
  }
  .examples {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: var(--space-roomy);
    margin-block-start: var(--space-roomy);
  }
  section {
    padding: var(--space-roomy);
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-card);
  }
  .fields {
    display: grid;
    gap: var(--space-close);
  }
  .fields label {
    font-size: var(--font-size-caption);
  }
  .preview :global(.status) {
    padding: var(--space-tight) var(--space-close);
  }
  .empty {
    color: var(--color-text-secondary);
  }
</style>
