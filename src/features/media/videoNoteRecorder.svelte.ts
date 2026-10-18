/**
 * Запись «кружочка» — `VideoNoteRecorder` нативной Искры на `MediaRecorder`.
 *
 * Запись идёт **с `<canvas>`**, а не с камеры (см. план, «Кодеки»): камера рисуется в квадрат
 * 480×480 с обрезкой середины, а записывается поток канваса и звук микрофона. Рекордер о
 * камере не знает вообще — поэтому её можно перевернуть посреди записи: для него это просто
 * следующий кадр, а не конец файла. Тот же канвас и есть превью в кружке — что видно, то и
 * уходит.
 *
 * Фронтальная камера пишется зеркально, как и показывается, — как в нативной: человек,
 * снимающий себя, смотрит в зеркало, и получатель должен увидеть то же, что видел он, а не
 * часы на другой руке. Задняя — не зеркалится.
 */
import { squareCrop, VIDEO_NOTE_BITRATE, VIDEO_NOTE_FPS, VIDEO_NOTE_MAX_MS, VIDEO_NOTE_SIDE, videoNoteMimeType } from './videoNote';

export type VideoNoteState = 'idle' | 'preparing' | 'ready' | 'recording' | 'finishing' | 'denied' | 'unavailable' | 'failed';

/** Готовый «кружочек» — на пути в `TimelineStore.sendFiles`. */
export interface VideoNoteTake {
  blob: Blob;
  mimetype: string;
  /** мс */
  duration: number;
  thumbnail?: Blob;
}

export interface Camera {
  id: string;
  label: string;
}

/** Короче — палец задел кнопку. */
const MIN_DURATION_MS = 500;
const TICK_MS = 100;
/** Кадр для миниатюры — чуть после начала: самый первый бывает тёмным, камера ещё не открылась. */
const THUMBNAIL_AFTER_MS = 300;

export class VideoNoteRecorder {
  state = $state<VideoNoteState>('idle');
  /** мс записанного. */
  elapsed = $state(0);
  /** Камеры, если их больше одной, — выбор на десктопе. */
  cameras = $state.raw<Camera[]>([]);
  camera = $state<string | undefined>();
  /** Какой стороной смотрит камера: фронтальная — зеркало. */
  facing = $state<'user' | 'environment'>('user');
  /** Перевернуть можно — телефон с двумя сторонами. */
  canFlip = $state(false);

  /** Квадрат, в который рисуется камера, — он же превью. */
  readonly canvas: HTMLCanvasElement;
  /** Для полосы записи: волны у «кружочка» нет, прослушивания — тоже. */
  readonly levels: readonly number[] = [];
  readonly result = null;

  private generation = 0;
  private video: HTMLVideoElement;
  private cameraStream: MediaStream | null = null;
  private microphone: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private drawTimer: ReturnType<typeof setInterval> | undefined;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private startedAt = 0;
  private thumbnail: Promise<Blob | null> | null = null;
  private onCap: (() => void) | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = VIDEO_NOTE_SIDE;
    this.canvas.height = VIDEO_NOTE_SIDE;
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
  }

  /** Пишет ли браузер «кружочек», который сыграют на iPhone. */
  static supported(): boolean {
    return videoNoteMimeType() !== null;
  }

  get open(): boolean {
    return this.state !== 'idle';
  }

  get recording(): boolean {
    return this.state === 'recording';
  }

  /** Открыть камеру и микрофон. Разрешение браузер спросит здесь. */
  async prepare(): Promise<void> {
    if (this.state !== 'idle') return;
    const generation = ++this.generation;
    this.state = 'preparing';
    this.elapsed = 0;
    // Вместе, а не по очереди: браузер спросит о камере и микрофоне одним вопросом, где умеет.
    const [microphone, camera] = await Promise.allSettled([
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }),
      this.openCamera({ facingMode: this.facing }),
    ]);
    if (microphone.status === 'fulfilled') this.microphone = microphone.value;
    if (generation !== this.generation) {
      this.releaseDevices();
      return;
    }
    const failure = microphone.status === 'rejected' ? microphone.reason : camera.status === 'rejected' ? camera.reason : null;
    if (failure !== null) {
      this.releaseDevices();
      this.state = failure instanceof DOMException && (failure.name === 'NotAllowedError' || failure.name === 'SecurityError') ? 'denied' : 'unavailable';
      return;
    }
    this.startDrawing();
    await this.listCameras();
    if (generation === this.generation) this.state = 'ready';
  }

  private async openCamera(video: MediaTrackConstraints): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { ...video, width: { ideal: 640 }, height: { ideal: 640 }, frameRate: { ideal: VIDEO_NOTE_FPS } },
    });
    this.releaseCamera();
    this.cameraStream = stream;
    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings();
    if (settings?.deviceId) this.camera = settings.deviceId;
    // У вебкамеры стороны нет — она смотрит на человека, как фронтальная.
    this.facing = settings?.facingMode === 'environment' ? 'environment' : 'user';
    this.video.srcObject = stream;
    await this.video.play().catch(() => {});
  }

  private async listCameras(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === 'videoinput').map((device, index) => ({ id: device.deviceId, label: device.label || `${index + 1}` }));
      this.cameras = cameras.length > 1 ? cameras : [];
      this.canFlip = cameras.length > 1;
    } catch {
      this.cameras = [];
    }
  }

  /** Другая сторона телефона — посреди записи тоже: рекордер пишет канвас, а не камеру. */
  async flip(): Promise<void> {
    if (!this.cameraStream) return;
    try {
      await this.openCamera({ facingMode: { exact: this.facing === 'user' ? 'environment' : 'user' } });
    } catch {
      // Другой стороны нет — остаёмся на этой.
    }
  }

  /** Камера из списка — на десктопе, где у ноутбука своя и внешняя. */
  async useCamera(id: string): Promise<void> {
    if (!this.cameraStream || id === this.camera) return;
    try {
      await this.openCamera({ deviceId: { exact: id } });
    } catch {
      // Не открылась — остаёмся на прежней.
    }
  }

  /** Кадр камеры — в квадрат канваса, обрезкой середины; фронтальная — зеркально. */
  private startDrawing(): void {
    const context = this.canvas.getContext('2d');
    if (!context) return;
    clearInterval(this.drawTimer);
    // Таймер, а не `requestAnimationFrame`: кадры не должны вставать, когда вкладку закрыли
    // другим окном, — запись идёт дальше.
    this.drawTimer = setInterval(() => {
      const { videoWidth, videoHeight } = this.video;
      if (!videoWidth || !videoHeight) return;
      const crop = squareCrop(videoWidth, videoHeight);
      context.save();
      if (this.facing === 'user') {
        context.translate(VIDEO_NOTE_SIDE, 0);
        context.scale(-1, 1);
      }
      context.drawImage(this.video, crop.x, crop.y, crop.side, crop.side, 0, 0, VIDEO_NOTE_SIDE, VIDEO_NOTE_SIDE);
      context.restore();
    }, 1000 / VIDEO_NOTE_FPS);
  }

  /**
   * Начать запись. Ждёт камеру, если она ещё открывается. `oncap` — минута кончилась: запись
   * остановлена и ждёт, чтобы её отправили, — как в нативной, где на потолке «кружочек» уходит.
   */
  async start(oncap?: () => void): Promise<void> {
    if (this.state === 'idle') await this.prepare();
    while (this.state === 'preparing') await new Promise((resolve) => setTimeout(resolve, 20));
    if (this.state !== 'ready' || !this.microphone) return;
    const type = videoNoteMimeType();
    if (!type) {
      this.state = 'unavailable';
      return;
    }
    const stream = new MediaStream([...this.canvas.captureStream(VIDEO_NOTE_FPS).getVideoTracks(), ...this.microphone.getAudioTracks()]);
    let recorder: MediaRecorder;
    try {
      // Битрейт звука — на усмотрение браузера: AAC-кодировщик macOS не берёт 64 кбит/с на
      // 48 кГц и молча роняет запись (`EncodingError`), хотя `isTypeSupported` сказал «да».
      recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: VIDEO_NOTE_BITRATE });
    } catch {
      this.state = 'unavailable';
      return;
    }
    this.recorder = recorder;
    this.chunks = [];
    this.onCap = oncap ?? null;
    recorder.ondataavailable = (event) => {
      if (event.data.size) this.chunks.push(event.data);
    };
    // Кодировщик отказал посреди записи — сказать, а не ждать «Отправить» над пустотой.
    recorder.onerror = () => {
      if (this.recorder !== recorder) return;
      clearInterval(this.tickTimer);
      this.recorder = null;
      this.state = 'failed';
    };
    recorder.start(1000);
    this.startedAt = performance.now();
    this.state = 'recording';
    this.thumbnail = new Promise((resolve) =>
      setTimeout(() => {
        if (this.recorder !== recorder) return resolve(null);
        this.canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
      }, THUMBNAIL_AFTER_MS),
    );
    this.tickTimer = setInterval(() => {
      this.elapsed = Math.min(VIDEO_NOTE_MAX_MS, performance.now() - this.startedAt);
      if (this.elapsed >= VIDEO_NOTE_MAX_MS) {
        clearInterval(this.tickTimer);
        this.onCap?.();
      }
    }, TICK_MS);
  }

  /** Закончить и отдать записанное. `null` — отправлять нечего. */
  async finish(): Promise<VideoNoteTake | null> {
    const recorder = this.recorder;
    if (this.state !== 'recording' || !recorder) {
      this.cancel();
      return null;
    }
    const generation = ++this.generation;
    const duration = Math.round(Math.min(VIDEO_NOTE_MAX_MS, performance.now() - this.startedAt));
    this.state = 'finishing';
    clearInterval(this.tickTimer);
    // Уже остановился сам — события `stop` больше не будет.
    if (recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.addEventListener('stop', () => resolve(), { once: true });
        recorder.stop();
      });
    }
    const thumbnail = await this.thumbnail;
    const mimetype = (recorder.mimeType || 'video/mp4').split(';')[0]!;
    const blob = new Blob(this.chunks, { type: mimetype });
    if (generation === this.generation) this.reset();
    if (duration < MIN_DURATION_MS || !blob.size) return null;
    return { blob, mimetype, duration, ...(thumbnail ? { thumbnail } : {}) };
  }

  /** Выбросить: передумали. Камера и микрофон отпущены, ничего не уходит. */
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

  private releaseCamera(): void {
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;
  }

  private releaseDevices(): void {
    this.releaseCamera();
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.microphone = null;
    this.video.srcObject = null;
  }

  private reset(): void {
    clearInterval(this.drawTimer);
    clearInterval(this.tickTimer);
    this.drawTimer = undefined;
    this.tickTimer = undefined;
    this.releaseDevices();
    this.recorder = null;
    this.chunks = [];
    this.thumbnail = null;
    this.onCap = null;
    this.elapsed = 0;
    this.canvas.getContext('2d')?.clearRect(0, 0, VIDEO_NOTE_SIDE, VIDEO_NOTE_SIDE);
    this.state = 'idle';
  }
}
