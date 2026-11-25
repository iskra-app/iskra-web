<!--
  Поле ввода. Подпись для скринридера обязательна, даже если на экране её нет:
  подсказка внутри поля исчезает, как только в нём что-то появилось.
-->
<script lang="ts">
  import Input from './ui/Input.svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  interface Props {
    value: string;
    label: string;
    /** Показывать подпись над полем или только скринридеру. */
    showLabel?: boolean;
    /** Не `url`: браузер отказался бы отправлять `matrix.org` без схемы. Для адреса — `inputmode="url"`. */
    type?: 'text' | 'password';
    placeholder?: string;
    autocomplete?: HTMLInputAttributes['autocomplete'];
    inputmode?: HTMLInputAttributes['inputmode'];
    autofocus?: boolean;
    disabled?: boolean;
    invalid?: boolean;
    /** Человек что-то набрал — для тех, кто держит значение сам, а не через `bind:`. */
    oninput?: (value: string) => void;
  }
  let {
    value = $bindable(''),
    label,
    showLabel = false,
    type = 'text',
    placeholder,
    autocomplete,
    inputmode,
    autofocus = false,
    disabled = false,
    invalid = false,
    oninput,
  }: Props = $props();

  const id = $props.id();
  let input: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (autofocus) input?.focus();
  });
</script>

<div class="field">
  <label for={id} class:visually-hidden={!showLabel}>{label}</label>
  <Input
    bind:element={input}
    bind:value
    {id}
    {type}
    {placeholder}
    {autocomplete}
    {inputmode}
    {disabled}
    aria-invalid={invalid || undefined}
    oninput={(event) => oninput?.(event.currentTarget.value)}
    autocapitalize="off"
    autocorrect="off"
    spellcheck="false"
  />
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
  }
  label {
    font-size: var(--font-size-caption);
    color: var(--color-text-secondary);
  }
</style>
