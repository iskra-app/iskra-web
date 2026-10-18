<!--
  Кого может значить «@» — `MentionPicker` нативной Искры: над композером, лицо и имя в
  строке, Matrix ID рядом — только если в комнате два человека с этим именем.

  Здесь ещё и клавиатура: поле остаётся в фокусе (`aria-activedescendant`), `↑`/`↓` ведут по
  списку, `Enter` или `Tab` выбирают — композер передаёт их сюда.
-->
<script lang="ts">
  import Avatar from '../../design/Avatar.svelte';
  import { t } from '../../i18n/index.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';

  export interface MentionRow {
    id: string;
    name: string;
    avatarUrl?: string;
    ambiguous: boolean;
  }

  interface Props {
    id: string;
    members: MentionRow[];
    active: number;
    photoOf: (member: MentionRow) => string | undefined;
    onpick: (member: MentionRow) => void;
  }
  let { id, members, active, photoOf, onpick }: Props = $props();

  let list: HTMLUListElement | undefined = $state();
  $effect(() => {
    list?.querySelector(`#${CSS.escape(`${id}-${active}`)}`)?.scrollIntoView({ block: 'nearest' });
  });
</script>

<ul bind:this={list} {id} class="picker glass" role="listbox" aria-label={t('room.mentionSuggestions')}>
  {#each members as member, index (member.id)}
    <!-- Клавиатура — у поля (`aria-activedescendant`): фокус из него не уходит. -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <li
      id="{id}-{index}"
      role="option"
      aria-selected={index === active}
      class:active={index === active}
      onpointerdown={(event) => event.preventDefault()}
      onclick={() => onpick(member)}
    >
      <span class="avatar"><Avatar name={member.name} seed={member.id} photo={photoOf(member)} mode={preferences.faces} /></span>
      <span class="name">{member.name}</span>
      {#if member.ambiguous}<span class="id">{member.id}</span>{/if}
    </li>
  {/each}
</ul>

<style>
  .picker {
    transform-origin: bottom center;
    transition:
      opacity var(--timing-chrome) var(--ease-out),
      transform var(--timing-menu-open) var(--ease-menu-open);
    max-height: var(--size-mention-list);
    margin: 0 0 var(--space-close);
    padding: var(--space-tight) 0;
    border-radius: var(--radius-bubble);
    list-style: none;
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    min-height: var(--size-mention-row);
    padding: 0 var(--space-roomy);
    cursor: pointer;
  }
  li.active {
    background: var(--color-selected);
  }
  @media (hover: hover) {
    li:hover {
      background: var(--color-selected);
    }
  }
  .avatar {
    flex: none;
    width: var(--size-avatar);
    height: var(--size-avatar);
  }
  .name,
  .id {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .id {
    min-width: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  @starting-style {
    .picker {
      opacity: 0;
      transform: scale(var(--motion-scale-from));
    }
  }
</style>
