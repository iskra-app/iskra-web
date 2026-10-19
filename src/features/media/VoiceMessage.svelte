<!--
  Голосовое в ленте — `VoiceMessageView` нативной Искры: «▶», форма звука и длительность.

  Волна — отправителя, из события: получатель видит ту же картинку, что и тот, кто говорил, и
  ещё до того, как что-то скачал. Она же — полоса прогресса: позади играющего места столбики
  полным цветом, впереди — бледнее. Ручки перемотки нет нарочно: это сообщение, а не трек.
  Пауза — пауза, а не «сначала»: кто-то окликнул, ответили, слушаете дальше.

  Байты скачиваются (и расшифровываются) по первому «▶», не раньше. Играет одно голосовое за
  раз (`speaker.ts`). Ушло с экрана — встало, расшифрованная копия отпущена.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import { MediaError, type MediaLoader } from '../../core/media/media';
  import type { Attachment } from '../../core/timeline/message';
  import Waveform from '../../design/Waveform.svelte';
  import { duration as formatDuration } from '../../design/time';
  import { t } from '../../i18n/index.svelte.ts';
  import { claimSpeaker, releaseSpeaker } from './speaker';

  interface Props {
    attachment: Attachment;
    media: MediaLoader;
  }
  let { attachment, media }: Props = $props();

  /** Сорок столбиков, сколько бы точек ни прислали, — как в нативной. */
  const BARS = 40;

  let loading = $state(false);
  let playing = $state(false);
  let progress = $state(0);
  let problem = $state<'failed' | 'tampered' | null>(null);
  /** Длительность из самого файла — если отправитель её не прислал. */
  let measured = $state<number | undefined>();

  let audio: HTMLAudioElement | null = null;
  let url: string | null = null;
  let frame = 0;

  const listener = { pause: () => audio?.pause() };
  const samples = $derived(attachment.waveform?.length ? attachment.waveform : new Array<number>(BARS).fill(0));
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
    if (!player) return;
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
    cancelAnimationFrame(frame);
    audio?.pause();
    audio?.removeAttribute('src');
    audio = null;
    if (url) URL.revokeObjectURL(url);
    releaseSpeaker(listener);
  });
</script>

<div class="voice">
  <button
    type="button"
    class="play"
    disabled={loading || !attachment.source}
    aria-label={playing ? t('message.media.pause') : t('message.media.play')}
    title={playing ? t('message.media.pause') : t('message.media.play')}
    onclick={toggle}
  >
    <span class="glyph" class:loading>
      <svg viewBox={ICON_VIEWBOX} aria-hidden="true">
        {#if playing}<path d={icons.pause} />{:else}<path d={icons.play} />{/if}
      </svg>
    </span>
  </button>
  <span class="wave"><Waveform {samples} mode="fit" count={BARS} {progress} /></span>
  {#if total !== undefined}<span class="length">{formatDuration(total)}</span>{/if}
</div>
{#if problem}
  <span class="problem" role="alert">{problem === 'tampered' ? t('message.media.tampered') : t('message.media.failed')}</span>
{/if}

<style>
  .voice {
    display: flex;
    align-items: center;
    gap: var(--space-close);
  }
  /* Нарисована на 28, нажимается на 44: «▶» в пузыре маленький, палец — нет. */
  .play {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--tap-target);
    height: var(--tap-target);
    margin-inline: calc((var(--size-voice-button) - var(--tap-target)) / 2);
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .play:disabled {
    cursor: default;
  }
  .glyph {
    display: grid;
    place-items: center;
    width: var(--size-voice-button);
    height: var(--size-voice-button);
  }
  .glyph.loading {
    opacity: 0.5;
  }
  .glyph svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
  .wave {
    flex: none;
    width: var(--size-voice-waveform);
  }
  .length {
    flex: none;
    font-size: var(--font-size-caption);
    font-variant-numeric: tabular-nums;
  }
  .problem {
    display: block;
    margin-block-start: var(--space-tight);
    font-size: var(--font-size-caption);
    color: var(--color-danger);
  }
</style>
