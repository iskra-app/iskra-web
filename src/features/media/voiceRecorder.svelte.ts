/**
 * Запись голосового — `VoiceRecorder` нативной Искры, переложенный на `MediaRecorder`.
 *
 * Волна считается здесь, пока звук идёт, и едет вместе с сообщением: получатель звук ещё не
 * скачал — весь смысл пузыря в том, чтобы по форме и длине решить, слушать ли, — и нарисовать
 * её сам не может.
 *
 * Состояния — как в нативной. `starting` — чтобы показать полосу сразу, пока браузер открывает
 * микрофон (а в первый раз — спрашивает разрешение). `stopped` — запись кончилась, но сказанное
 * цело и ждёт «Отправить»: так бывает и по кнопке «Остановить», и само — на пяти минутах или
 * когда микрофон отобрали (выдернули гарнитуру, отозвали разрешение).
 */
import { decibelsOf, levelFromDecibels, MAX_DURATION_MS, MIN_DURATION_MS, resampleWaveform, SAMPLING_MS, voiceMimeType } from './voice';

/** Сколько столбиков живой волны держать: больше в полосу не влезет и на широком экране. */
const LIVE_LEVELS = 256;

export type RecorderState = 'idle' | 'starting' | 'recording' | 'stopped' | 'denied' | 'unavailable';

/** Готовое голосовое — на пути в `TimelineStore.sendFiles`. */
export interface Recording {
  blob: Blob;
  mimetype: string;
  /** мс — сколько в файле, а не сколько прошло с начала */
  duration: number;
  /** 128 точек, 0…1 */
  waveform: number[];
}

export class VoiceRecorder {
  state = $state<RecorderState>('idle');
  /** мс записанного. */
  elapsed = $state(0);
  /** Громкость последних мгновений, 0…1 — живая волна в полосе. Вся запись — в `heard`. */
  levels = $state.raw<number[]>([]);
  /** Остановленная запись — для прослушивания перед отправкой. */
  result = $state.raw<Recording | null>(null);

  /**
   * Растёт при каждом «отпустили» — `cancel()` и `finish()`. `start()` ждёт посередине, и в
   * первый раз это ожидание — вопрос браузера о микрофоне: палец к тому времени давно отпущен,
   * а без этой проверки микрофон бы открылся за экраном, на котором записи нет.
   */
  private generation = 0;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private heard: number[] = [];
  /** Остановленная запись — и та, что уйдёт без прослушивания. */
  private kept: Recording | null = null;
  private audio: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private startedAt = 0;
  private stopping: Promise<void> | null = null;
  private mimetype = '';

  /** Пишет ли браузер голосовое, которое услышат на iPhone. */
  static supported(): boolean {
    return voiceMimeType() !== null;
  }

  get active(): boolean {
    return this.state === 'starting' || this.state === 'recording' || this.state === 'stopped';
  }

  async start(): Promise<void> {
    if (this.active) return;
    const type = voiceMimeType();
    if (!type) {
      this.state = 'unavailable';
      return;
    }
    const generation = ++this.generation;
    this.state = 'starting';
    this.elapsed = 0;
    this.levels = [];
    this.heard = [];
    this.result = null;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      if (generation !== this.generation) return;
      this.state = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError') ? 'denied' : 'unavailable';
      return;
    }
    // Отпустили, пока браузер спрашивал или открывал микрофон.
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 48_000 });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      this.state = 'unavailable';
      return;
    }
    this.stream = stream;
    this.recorder = recorder;
    this.mimetype = type.split(';')[0]!;
    this.chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) this.chunks.push(event.data);
    };
    // Остановился сам — микрофон отобрали. Сказанное остаётся.
    recorder.onstop = () => {
      if (this.recorder === recorder && this.state === 'recording') void this.stop();
    };
    stream.getAudioTracks().forEach((track) => track.addEventListener('ended', () => this.recorder === recorder && void this.stop()));

    const meter = this.meter(stream);
    recorder.start(1000);
    this.startedAt = performance.now();
    this.state = 'recording';
    this.timer = setInterval(() => {
      if (this.state !== 'recording') return;
      this.elapsed = Math.min(MAX_DURATION_MS, performance.now() - this.startedAt);
      if (meter) {
        this.heard.push(meter());
        this.levels = this.heard.slice(-LIVE_LEVELS);
      }
      if (this.elapsed >= MAX_DURATION_MS) void this.stop();
    }, SAMPLING_MS);
  }

  /** Громкость микрофона «сейчас», 0…1. Нет Web Audio — волна плоская, запись — нет. */
  private meter(stream: MediaStream): (() => number) | null {
    try {
      const audio = new AudioContext();
      this.audio = audio;
      void audio.resume().catch(() => {});
      const analyser = audio.createAnalyser();
      analyser.fftSize = 1024;
      audio.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      return () => {
        analyser.getFloatTimeDomainData(buffer);
        return levelFromDecibels(decibelsOf(buffer));
      };
    } catch {
      return null;
    }
  }

  /**
   * Остановить, но не отправлять: голосовое ждёт «Отправить» и его можно послушать. Микрофон
   * отпускается сразу — красная точка браузера не должна гореть над остановленной записью.
   */
  stop(): Promise<void> {
    return this.halt(true);
  }

  /** `preview` — показать остановленное для прослушивания; при отправке сразу — незачем. */
  private halt(preview: boolean): Promise<void> {
    if (this.state !== 'recording' || !this.recorder) return this.stopping ?? Promise.resolve();
    const recorder = this.recorder;
    const generation = this.generation;
    this.elapsed = Math.min(MAX_DURATION_MS, performance.now() - this.startedAt);
    this.state = 'stopped';
    clearInterval(this.timer);
    this.stopping = new Promise<void>((resolve) => {
      const done = () => {
        if (generation === this.generation && this.recorder === recorder) {
          this.kept = {
            blob: new Blob(this.chunks, { type: this.mimetype }),
            mimetype: this.mimetype,
            duration: Math.round(this.elapsed),
            waveform: resampleWaveform(this.heard),
          };
          if (preview) this.result = this.kept;
        }
        resolve();
      };
      if (recorder.state === 'inactive') done();
      else {
        recorder.addEventListener('stop', done, { once: true });
        recorder.stop();
      }
    });
    this.releaseDevices();
    return this.stopping;
  }

  /**
   * Закончить и отдать записанное. `null` — отправлять нечего: короче полсекунды, отменено
   * или микрофон так и не открылся.
   */
  async finish(): Promise<Recording | null> {
    if (this.state === 'recording') await this.halt(false);
    else if (this.stopping) await this.stopping;
    const result = this.state === 'stopped' ? this.kept : null;
    this.generation++;
    this.reset();
    return result && result.duration >= MIN_DURATION_MS && result.blob.size > 0 ? result : null;
  }

  /** Выбросить — передумали. Ничего не уходит, микрофон отпущен. */
  cancel(): void {
    this.generation++;
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        // уже остановлен
      }
    }
    this.reset();
  }

  /** Убрать «нет доступа» — следующее нажатие спросит снова. */
  dismiss(): void {
    if (this.state === 'denied' || this.state === 'unavailable') this.state = 'idle';
  }

  private releaseDevices(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.audio?.close().catch(() => {});
    this.audio = null;
  }

  private reset(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.releaseDevices();
    this.recorder = null;
    this.chunks = [];
    this.stopping = null;
    this.kept = null;
    this.result = null;
    this.levels = [];
    this.heard = [];
    this.elapsed = 0;
    this.state = 'idle';
  }
}
