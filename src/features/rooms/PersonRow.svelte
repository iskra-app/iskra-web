<!--
  Строка «Нового чата» — `PersonRow` нативной Искры: лицо, имя и серая строка под ним (адрес,
  «Написать по этому адресу», у комнаты — сколько в ней людей). Нажатие — у того, кто строку
  поставил.
-->
<script lang="ts">
  import Avatar from '../../design/Avatar.svelte';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import { Photo, pixelsFor } from './faces.svelte.ts';

  interface Props {
    session: UserSession;
    name: string;
    subtitle: string;
    /** Ещё строка мельче — описание комнаты. */
    detail?: string;
    seed: string;
    avatarUrl?: string | undefined;
    busy?: boolean;
    disabled?: boolean;
    onclick: () => void;
  }
  let { session, name, subtitle, detail, seed, avatarUrl, busy = false, disabled = false, onclick }: Props = $props();

  const photo = $derived(new Photo(session, avatarUrl, pixelsFor(2.5)));
</script>

<button type="button" class="person" {disabled} aria-busy={busy} {onclick}>
  <span class="face"><Avatar {name} {seed} photo={photo.url} mode={preferences.faces} /></span>
  <span class="what">
    <span class="name">{name}</span>
    <span class="subtitle">{subtitle}</span>
    {#if detail}<span class="detail">{detail}</span>{/if}
  </span>
</button>

<style>
  .person {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    width: 100%;
    min-height: var(--tap-target);
    padding: var(--space-close) var(--space-normal);
    border: none;
    border-radius: var(--radius-control);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .person:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .person[aria-busy='true'] {
    opacity: 0.6;
  }
  @media (hover: hover) {
    .person:not(:disabled):hover {
      background: var(--color-selected);
    }
  }
  .face {
    --avatar-size: var(--size-avatar);
    flex: none;
  }
  .what {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name,
  .subtitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .subtitle {
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .detail {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
</style>
