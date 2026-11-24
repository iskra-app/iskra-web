<!--
  Голосовое в ленте — круглая кнопка, волна с длительностью под ней и время в углу пузыря.

  Волна — отправителя, из события: получатель видит ту же картинку, что и тот, кто говорил, и
  ещё до того, как что-то скачал. Она же — полоса прогресса: позади играющего места столбики
  полным цветом, впереди — бледнее. Ручки перемотки нет нарочно: это сообщение, а не трек.
  Пауза — пауза, а не «сначала»: кто-то окликнул, ответили, слушаете дальше.

  Байты скачиваются (и расшифровываются) по первому «▶», не раньше. Играет одно голосовое за
  раз (`speaker.ts`). Ушло с экрана — встало, расшифрованная копия отпущена.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../../design/Icon.svelte';
  import { MediaError, type MediaLoader } from '../../core/media/media';
  import type { Attachment } from '../../core/timeline/message';
  import Waveform from '../../design/Waveform.svelte';
  import { duration as formatDuration } from '../../design/time';
  import { t } from '../../i18n/index.svelte.ts';
  import { claimSpeaker, releaseSpeaker } from './speaker';
  import { colorScheme } from '../app/colorScheme.svelte.ts';
  import { preferences } from '../app/preferences.svelte.ts';

  interface Props {
    attachment: Attachment;
    media: MediaLoader;
    own?: boolean;
    marks?: Snippet;
  }
  let { attachment, media, own = false, marks }: Props = $props();

  const BARS = 30;

  let loading = $state(false);
  let playing = $state(false);
  let progress = $state(0);
  let problem = $state<'failed' | 'tampered' | null>(null);
  /** Длительность из самого файла — если отправитель её не прислал. */
  let measured = $state<number | undefined>();

  let audio: HTMLAudioElement | null = null;
  let url: string | null = null;
  let frame = 0;
  let destroyed = false;

  const listener = { pause: () => audio?.pause() };
  const samples = $derived(attachment.waveform?.length ? attachment.waveform : new Array<number>(BARS).fill(0));
  const bars = $derived(Math.min(samples.length, BARS));
  const total = $derived(attachment.duration ?? measured);

  /** Прогресс — каждым кадром, пока играет: `timeupdate` приходит четыре раза в секунду, и волна шла бы рывками. */
  function follow() {
    cancelAnimationFrame(frame);
    if (!audio || audio.paused) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) progress = Math.min(1, audio.currentTime / audio.duration);
    frame = requestAnimationFrame(follow);
  }

  async function load(): Promise<HTMLAudioElement | null> {
    if (audio) return audio;
    if (!attachment.source) return null;
    loading = true;
    problem = null;
    try {
      const blob = await media.blob(attachment.source, attachment.mimetype);
      if (destroyed) return null;
      url = URL.createObjectURL(blob);
      const created = new Audio(url);
      created.preload = 'auto';
      created.addEventListener('play', () => {
        playing = true;
        follow();
      });
      created.addEventListener('pause', () => {
        playing = false;
        cancelAnimationFrame(frame);
      });
      created.addEventListener('ended', () => {
        playing = false;
        progress = 0;
        releaseSpeaker(listener);
      });
      created.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(created.duration)) measured = created.duration * 1000;
      });
      created.addEventListener('error', () => {
        playing = false;
        problem = 'failed';
      });
      audio = created;
      return created;
    } catch (error) {
      problem = error instanceof MediaError && error.reason === 'tampered' ? 'tampered' : 'failed';
      return null;
    } finally {
      loading = false;
    }
  }

  async function toggle() {
    if (playing) {
      audio?.pause();
      return;
    }
    const player = await load();
    if (!player || destroyed) return;
    claimSpeaker(listener);
    await player.play().catch((error: unknown) => {
      // У плеера, а не вслепую: отказ прежнего `play()` (пауза раньше звука) Firefox может
      // принести, когда следующее нажатие уже играет.
      playing = !player.paused;
      // Паузу нажали раньше, чем звук пошёл, — это не сбой.
      if (!(error instanceof DOMException && error.name === 'AbortError')) problem = 'failed';
    });
  }

  $effect(() => () => {
    destroyed = true;
    cancelAnimationFrame(frame);
    audio?.pause();
    audio?.removeAttribute('src');
    audio = null;
    if (url) URL.revokeObjectURL(url);
    releaseSpeaker(listener);
  });
</script>

<div class="voice" class:own>
  <button
    type="button"
    class="play press"
    disabled={loading || !attachment.source}
    aria-busy={loading}
    aria-label={playing ? t('message.media.pause') : t('message.media.play')}
    title={playing ? t('message.media.pause') : t('message.media.play')}
    onclick={toggle}
  >
    {#if loading}
      <span class="spinner" aria-hidden="true"></span>
    {:else}
      {#key playing}<Icon name={playing ? 'pause' : 'play'} class="icon-swap" />{/key}
    {/if}
  </button>
  <div class="track">
    <span class="wave" style:--voice-width-fraction={bars / BARS}>
      {#key `${colorScheme.light}:${preferences.accent}`}
        <Waveform {samples} mode="fit" count={bars} {progress} />
      {/key}
    </span>
    {#if total !== undefined}<span class="length">{formatDuration(total)}</span>{/if}
  </div>
  {#if marks}<span class="meta">{@render marks()}</span>{/if}
</div>
{#if problem}
  <span class="problem" role="alert">{problem === 'tampered' ? t('message.media.tampered') : t('message.media.failed')}</span>
{/if}

<style>
  .voice {
    display: flex;
    align-items: center;
    gap: var(--space-close);
    color: color-mix(in srgb, var(--accent) 65%, var(--color-text));
  }
  .voice.own {
    color: var(--on-bubble-own);
  }
  .play {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--size-voice-play);
    height: var(--size-voice-play);
    padding: 0;
    border: none;
    border-radius: var(--radius-circle);
    background: var(--accent);
    color: var(--on-accent);
    cursor: pointer;
  }
  .own .play {
    background: var(--on-bubble-own);
    color: var(--bubble-own);
  }
  .play:disabled {
    cursor: default;
  }
  .play :global(svg) {
    width: var(--size-icon);
    height: var(--size-icon);
  }
  .spinner {
    width: var(--size-icon);
    height: var(--size-icon);
    border: var(--border-thick) solid currentColor;
    border-inline-end-color: transparent;
    border-radius: var(--radius-circle);
    animation: spin var(--timing-spinner) linear infinite;
  }
  @keyframes spin { to { transform: rotate(1turn); } }
  .track {
    display: flex;
    flex-direction: column;
    gap: var(--space-tight);
    min-width: 0;
  }
  .wave {
    width: calc(var(--size-voice-waveform) * var(--voice-width-fraction));
    max-width: 100%;
  }
  .length {
    font-size: var(--font-size-caption);
    font-variant-numeric: tabular-nums;
  }
  .meta {
    align-self: end;
    margin-inline-start: auto;
  }
  .problem {
    display: block;
    margin-block-start: var(--space-tight);
    font-size: var(--font-size-caption);
    color: var(--color-danger);
  }
</style>
