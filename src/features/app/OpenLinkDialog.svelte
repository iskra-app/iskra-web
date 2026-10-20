<!--
  Чужая ссылка — `#/open/<id>`, куда ведёт кнопка «Открыть в Iskra Web» на `s.iskra.wtf`.
  Сначала спрашиваем, потом делаем: ссылку мог прислать кто угодно, и ни чат, ни вход в комнату
  не должны случаться от одного щелчка по ней. Куда идти без вопроса (свой чат, своя комната), —
  решает оболочка, сюда это не доходит.
-->
<script lang="ts">
  import Avatar from '../../design/Avatar.svelte';
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import { preferences } from './preferences.svelte.ts';

  interface Props {
    open: boolean;
    session: UserSession;
    /** `@человек:сервер`, `#адрес:сервер` или `!id:сервер`. */
    target: string;
    via?: string[] | undefined;
    /** Открыть получившийся чат. */
    onopen: (roomId: string) => void;
    onclose: () => void;
  }
  let { open, session, target, via, onopen, onclose }: Props = $props();

  const person = $derived(target.startsWith('@'));
  let name = $state('');
  let busy = $state(false);
  let failure = $state<TextKey | null>(null);

  // Имя человека — когда сервер его назовёт; до тех пор и вместо — его ID.
  $effect(() => {
    const asked = target;
    if (!open) return;
    name = asked;
    failure = null;
    if (!asked.startsWith('@')) return;
    let cancelled = false;
    void session.profileOf(asked).then((profile) => {
      if (!cancelled) name = profile.name;
    });
    return () => {
      cancelled = true;
    };
  });

  async function confirm() {
    if (busy) return;
    busy = true;
    failure = null;
    try {
      onopen(person ? await session.createDirect(target) : await session.joinRoom(target, via));
    } catch {
      failure = person ? 'roomAction.createFailed' : 'roomAction.joinFailed';
    } finally {
      busy = false;
    }
  }
</script>

<Dialog {open} title={t(person ? 'openLink.writeQuestion' : 'openLink.joinQuestion', { name })} {onclose}>
  <div class="sheet">
    <span class="face"><Avatar {name} seed={target} mode={preferences.faces} /></span>
    {#if name !== target}<strong class="name">{name}</strong>{/if}
    <span class="subtitle selectable">{target}</span>
  </div>
  {#if failure}<p class="problem" role="alert">{t(failure)}</p>{/if}
  <PrimaryButton wide {busy} onclick={() => void confirm()}>{t(person ? 'openLink.write' : 'roomList.new.join')}</PrimaryButton>
  <PlainButton onclick={onclose}>{t('common.cancel')}</PlainButton>
</Dialog>

<style>
  .sheet {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-roomy);
    text-align: center;
  }
  .face {
    --avatar-size: var(--size-avatar-large);
  }
  .name {
    font-size: var(--font-size-title);
    overflow-wrap: anywhere;
  }
  .subtitle {
    color: var(--color-text-secondary);
    overflow-wrap: anywhere;
  }
  .selectable {
    user-select: text;
    -webkit-user-select: text;
  }
  .problem {
    margin: 0;
    color: var(--color-danger);
    font-size: var(--font-size-caption);
  }
</style>
