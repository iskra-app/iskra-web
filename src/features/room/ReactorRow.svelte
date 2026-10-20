<!-- Строка «кто поставил»: лицо, имя и его эмодзи — «Все» читается списком людей, а не значков. -->
<script lang="ts">
  import Avatar from '../../design/Avatar.svelte';
  import type { Reactor } from '../../core/timeline/timelineStore.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';
  import { Photo, pixelsFor } from '../rooms/faces.svelte.ts';

  let { reactor, session }: { reactor: Reactor; session: UserSession } = $props();
  const photo = $derived(new Photo(session, reactor.avatarUrl, pixelsFor(2.5)));
</script>

<li class="reactor">
  <span class="face"><Avatar name={reactor.name} seed={reactor.userId} photo={photo.url} mode={preferences.faces} /></span>
  <span class="name">{reactor.name}</span>
  <span class="key">{reactor.key}</span>
</li>

<style>
  .reactor {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    min-height: var(--tap-target);
    padding: var(--space-tight) var(--space-normal);
  }
  .face {
    flex: none;
    width: var(--size-avatar);
    height: var(--size-avatar);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .key {
    font-size: var(--font-size-title);
  }
</style>
