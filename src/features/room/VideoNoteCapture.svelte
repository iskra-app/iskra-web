<!--
  Камера «кружочка» поверх комнаты — `VideoNoteComposer` нативной Искры: размытая комната,
  кружок с лицом и кольцом минуты вокруг, внизу — полоса записи с «Отменой» и спуск.

  В кружке — сам канвас рекордера: что видно, то и уходит, вплоть до зеркала.

  Спуск: пока идёт запись — стрелка «Отправить» (стрелка, а не квадрат «стоп»: остановленный
  «кружочек» нигде не ждёт, он сразу уходит); до записи — камера, нажатие начинает. Пока палец
  держит кнопку в композере, над спуском — замок: вверх — без рук.

  Телефон — «Перевернуть камеру», десктоп — выбор камеры из списка, если их больше одной.
-->
<script lang="ts">
  import { ICON_VIEWBOX, icons } from '../../design/icons.ts';
  import { tick } from 'svelte';
  import { viewport } from '../../design/viewport.svelte.ts';
  import { t, type TextKey } from '../../i18n/index.svelte.ts';
  import { VIDEO_NOTE_MAX_MS } from '../media/videoNote';
  import type { VideoNoteRecorder, VideoNoteState } from '../media/videoNoteRecorder.svelte.ts';
  import RecordingStrip from './RecordingStrip.svelte';

  interface Props {
    recorder: VideoNoteRecorder;
    /** Палец ещё держит кнопку в композере. */
    holding: boolean;
    onsend: () => void;
    oncancel: () => void;
  }
  let { recorder, holding, onsend, oncancel }: Props = $props();

  let shutter: HTMLButtonElement | undefined = $state();
  const recording = $derived(recorder.state === 'recording');
  const ready = $derived(recorder.state === 'ready');
  const progress = $derived(Math.min(1, recorder.elapsed / VIDEO_NOTE_MAX_MS));
  const hints: Partial<Record<VideoNoteState, TextKey>> = {
    denied: 'videoNote.needsCamera',
    unavailable: 'videoNote.noCamera',
    failed: 'videoNote.failed',
    finishing: 'videoNote.sending',
  };
  const hint = $derived(hints[recorder.state] ? t(hints[recorder.state]!) : '');
  const showPicture = $derived(ready || recording);

  /** Канвас рекордера — в кружок. Он живёт дольше этого слоя: здесь только вставляется. */
  function mount(node: HTMLElement) {
    node.append(recorder.canvas);
    return { destroy: () => recorder.canvas.remove() };
  }

  // Открыли без пальца (мышь, клавиатура) — фокус на спуск, как только он нажимается:
  // Enter отправит, Esc выбросит. Один раз — дальше фокус человека.
  let focused = false;
  $effect(() => {
    if (focused || holding || !(ready || recording)) return;
    focused = true;
    void tick().then(() => shutter?.focus());
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    oncancel();
  }

  function press() {
    if (recording) onsend();
    else if (ready) void recorder.start(onsend);
  }
</script>

<div class="capture" role="dialog" aria-label={t('videoNote.title')} tabindex="-1" {onkeydown}>
  <div class="stage">
    <div class="circle" class:live={showPicture}>
      <div class="picture" use:mount></div>
      <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
        <!-- С двенадцати часов по часовой: поворот — атрибутом, числа в стилях не живут. -->
        <circle cx="50" cy="50" r="49" transform="rotate(-90 50 50)" pathLength="1" stroke-dasharray="1" stroke-dashoffset={1 - progress} />
      </svg>
    </div>
    <p class="hint" aria-live="polite">{hint}</p>
  </div>
  <div class="controls">
    <div class="left">
      {#if viewport.finePointer && recorder.cameras.length > 1}
        <select aria-label={t('videoNote.camera')} value={recorder.camera} onchange={(event) => void recorder.useCamera((event.currentTarget as HTMLSelectElement).value)}>
          {#each recorder.cameras as camera (camera.id)}
            <option value={camera.id}>{camera.label}</option>
          {/each}
        </select>
      {:else if !viewport.finePointer && recorder.canFlip}
        <button type="button" class="flip" aria-label={t('videoNote.flipCamera')} title={t('videoNote.flipCamera')} onclick={() => void recorder.flip()}>
          <svg viewBox={ICON_VIEWBOX} aria-hidden="true"><path d={icons.switchCamera} /></svg>
        </button>
      {/if}
      <RecordingStrip {recorder} onCamera {oncancel} />
    </div>
    <div class="right">
      {#if holding && recording}
        <span class="lock" aria-hidden="true">
          <svg viewBox={ICON_VIEWBOX}><path d={icons.lock} /></svg>
          <svg viewBox={ICON_VIEWBOX}><path d={icons.up} /></svg>
        </span>
      {/if}
      <button
        bind:this={shutter}
        type="button"
        class="shutter"
        class:recording
        disabled={!ready && !recording}
        aria-label={recording ? t('recording.send') : t('videoNote.holdToRecord')}
        title={recording ? t('recording.send') : t('videoNote.holdToRecord')}
        onclick={press}
      >
        <svg viewBox={ICON_VIEWBOX} aria-hidden="true">
          {#if recording}<path d={icons.send} />{:else}<path d={icons.video} />{/if}
        </svg>
      </button>
    </div>
  </div>
</div>

<style>
  .capture {
    position: absolute;
    z-index: 10;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-roomy);
    padding: var(--space-roomy) var(--space-close);
    padding-block-end: max(var(--space-roomy), env(safe-area-inset-bottom));
    background: var(--color-camera-scrim);
    -webkit-backdrop-filter: blur(var(--backdrop-blur));
    backdrop-filter: blur(var(--backdrop-blur));
    color: var(--color-on-camera);
    transition: opacity var(--timing-chrome) var(--ease-out);
  }
  @starting-style {
    .capture {
      opacity: 0;
    }
  }
  .capture:focus {
    outline: none;
  }
  .stage {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-roomy);
    min-height: 0;
  }
  .circle {
    position: relative;
    width: min(100%, var(--size-video-note-camera), var(--size-video-note-camera-fit));
    aspect-ratio: 1;
    border-radius: var(--radius-circle);
    background: var(--color-camera-plate);
    transition: transform var(--timing-arrival) var(--ease-menu-open);
  }
  @starting-style {
    .circle {
      transform: scale(var(--motion-scale-from));
    }
  }
  .picture {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: var(--radius-circle);
    opacity: 0;
    transition: opacity var(--timing-chrome) var(--ease-out);
  }
  .circle.live .picture {
    opacity: 1;
  }
  .picture :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }
  /* Кольцо минуты — по краю кружка, как `trim` нативной. */
  .ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-width: var(--size-video-note-ring);
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .hint {
    max-width: var(--size-video-note-hint);
    min-height: 1lh;
    margin: 0;
    text-align: center;
    opacity: 0.8;
  }
  .controls {
    display: flex;
    align-items: flex-end;
    gap: var(--space-close);
    width: 100%;
    max-width: var(--column-timeline-max);
    margin-inline: auto;
  }
  .left {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-close);
    min-width: 0;
  }
  .left :global(.strip) {
    width: 100%;
  }
  .right {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: center;
    gap: var(--space-close);
  }
  .flip {
    display: grid;
    place-items: center;
    width: var(--tap-target);
    height: var(--tap-target);
    border: none;
    border-radius: var(--radius-circle);
    background: var(--color-camera-plate);
    color: inherit;
    cursor: pointer;
  }
  select {
    max-width: 100%;
    min-height: var(--tap-target);
    padding-inline: var(--space-normal);
    border: none;
    border-radius: var(--radius-control);
    background: var(--color-camera-plate);
    color: inherit;
    font: inherit;
  }
  .flip svg,
  .lock svg {
    width: var(--size-icon);
    height: var(--size-icon);
    fill: currentColor;
  }
  .lock {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-tight);
    padding: var(--space-close);
    border-radius: var(--radius-circle);
    background: var(--color-camera-plate);
    transition:
      opacity var(--timing-chrome) var(--ease-out),
      transform var(--timing-chrome) var(--ease-out);
  }
  @starting-style {
    .lock {
      opacity: 0;
      transform: translateY(var(--motion-rise));
    }
  }
  .shutter {
    display: grid;
    place-items: center;
    width: var(--size-recording-send);
    height: var(--size-recording-send);
    border: none;
    border-radius: var(--radius-circle);
    background: var(--color-camera-plate);
    color: inherit;
    cursor: pointer;
    transition: background-color var(--timing-chrome) var(--ease-out);
  }
  .shutter.recording {
    background: var(--accent);
    color: var(--on-accent);
  }
  .shutter:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .shutter svg {
    width: var(--size-icon-button);
    height: var(--size-icon-button);
    fill: currentColor;
  }
</style>
