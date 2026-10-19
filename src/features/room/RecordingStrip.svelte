<!--
  Что записывается, и как это выбросить: красная точка, часы, волна и «Отмена» —
  `RecordingStrip` нативной Искры. Стоит в композере на месте поля, пока идёт запись.

  Точка дышит, пока микрофон слушает, и становится серой, когда запись кончилась (кнопкой
  «Остановить», на пяти минутах или потому что микрофон отобрали): точка, которая дышит над
  выключенным микрофоном, — маленькая ложь человеку, который в него ещё говорит.

  Остановленное можно послушать перед отправкой — на месте точки «Слушать», волна закрашивается
  по мере игры, часы показывают, где сейчас.

  «Отмена» — всегда кнопка и всегда одно слово, в том числе пока палец держит запись: держит
  один палец, а нажать можно другим.

  Одна на оба вида записи: та же полоса стоит в композере, пока говорят, и под камерой, пока
  снимают (`onCamera`) — там она на тёмной плашке и без волны: лицо в кружке и так говорит,
  что запись идёт.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import Waveform from '../../design/Waveform.svelte';
  import { duration } from '../../design/time';
  import { t } from '../../i18n/index.svelte.ts';
  import type { Recording } from '../media/voiceRecorder.svelte.ts';

  /** Что записывается: `VoiceRecorder` или `VideoNoteRecorder`. */
  interface Source {
    readonly state: string;
    readonly elapsed: number;
    readonly levels: readonly number[];
    readonly result: Recording | null;
  }

  interface Props {
    recorder: Source;
    oncancel: () => void;
    onCamera?: boolean;
  }
  let { recorder, oncancel, onCamera = false }: Props = $props();

  const live = $derived(recorder.state !== 'stopped');

  let player: HTMLAudioElement | undefined = $state();
  let playing = $state(false);
  let position = $state(0);
  let url = $state<string | undefined>();

  $effect(() => {
    const blob = recorder.result?.blob;
    if (!blob) return;
    const created = URL.createObjectURL(blob);
    url = created;
    return () => {
      URL.revokeObjectURL(created);
      url = undefined;
      playing = false;
      position = 0;
    };
  });

  function toggle() {
    if (!player) return;
    if (player.paused) void player.play().catch(() => (playing = false));
    else player.pause();
  }

  const total = $derived(recorder.result?.duration ?? recorder.elapsed);
  const shown = $derived(playing || position > 0 ? position * 1000 : total);
</script>

<div class="strip" class:camera={onCamera} role="group" aria-label={onCamera ? t('videoNote.recording') : t('voice.recording')}>
  {#if !live && url}
    <button type="button" class="play" aria-label={playing ? t('message.media.pause') : t('message.media.play')} title={playing ? t('message.media.pause') : t('message.media.play')} onclick={toggle}>
      <svg viewBox={ICON_VIEWBOX} aria-hidden="true">
        {#if playing}<path d={icons.pause} />{:else}<path d={icons.play} />{/if}
      </svg>
    </button>
    <audio
      bind:this={player}
      src={url}
      preload="auto"
      onplay={() => (playing = true)}
      onpause={() => (playing = false)}
      onended={() => {
        playing = false;
        position = 0;
      }}
      ontimeupdate={() => (position = player?.currentTime ?? 0)}
    ></audio>
  {:else}
    <span class="dot" class:live aria-hidden="true"></span>
  {/if}
  <span class="clock">{duration(shown)}</span>
  <span class="wave">
    {#if onCamera}
      <!-- волны нет: см. выше -->
    {:else if !live && recorder.result}
      <Waveform samples={recorder.result.waveform} mode="fit" progress={total ? Math.min(1, (position * 1000) / total) : 0} />
    {:else}
      <Waveform samples={recorder.levels} />
    {/if}
  </span>
  <button type="button" class="cancel" onclick={oncancel}>{t('recording.cancel')}</button>
</div>

<style>
  .strip {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-close);
    min-width: 0;
    height: var(--size-navigation-bar);
    padding-inline: var(--space-roomy) 0;
    border: var(--border-hairline) solid var(--color-separator);
    border-radius: var(--radius-bubble);
    background: var(--color-background);
    transition: opacity var(--timing-chrome) var(--ease-out);
  }
  .strip.camera {
    border-color: transparent;
    background: var(--color-camera-plate);
    color: var(--color-on-camera);
  }
  @starting-style {
    .strip {
      opacity: 0;
    }
  }
  .dot {
    flex: none;
    width: var(--size-recording-dot);
    height: var(--size-recording-dot);
    border-radius: var(--radius-circle);
    background: var(--color-text-secondary);
  }
  /* Дышит, пока слушает. «Уменьшить движение» гасит анимацию глобально — точка просто красная. */
  .dot.live {
    background: var(--color-danger);
    animation: breathe var(--timing-recording-pulse) ease-in-out infinite alternate;
  }
  @keyframes breathe {
    to {
      opacity: 0.3;
    }
  }
  .play {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--size-icon-button);
    height: var(--size-icon-button);
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
  }
  .play svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
  .clock {
    flex: none;
    font-variant-numeric: tabular-nums;
  }
  .wave {
    flex: 1;
    min-width: 0;
    color: var(--color-text-secondary);
  }
  .cancel {
    flex: none;
    min-height: var(--tap-target);
    padding-inline: var(--space-close) var(--space-roomy);
    border: none;
    border-radius: var(--radius-bubble);
    background: transparent;
    color: var(--color-danger);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }
</style>
