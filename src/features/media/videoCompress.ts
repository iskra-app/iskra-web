/**
 * Сжатие видео — `VideoTranscoder` нативной Искры: кадр вписан в рамку ступени, битрейт —
 * число, а не пресет, на выходе H.264 + AAC в mp4, который играет и `AVPlayer` на iPhone.
 *
 * Кодирует сам браузер (WebCodecs), разбирает и собирает контейнер Mediabunny (MPL-2.0). Он
 * грузится отдельным куском сборки — только когда видео и правда уходит сжатым. WASM и воркеров
 * у него нет: CSP та же.
 *
 * Конвейер свой, из кирпичей Mediabunny, а не его `Conversion`: тому не задать профиль H.264.
 * А он нужен — кодер WebKit в профилях Main и High копит кадры (B-кадры) и, пока очередь
 * короткая, не отдаёт ни одного: перекодирование встаёт навсегда. Где так, — Baseline
 * (`avcCodecString`): проверка поведения, а не имени браузера.
 *
 * Чего браузер не умеет, того и не делаем — видео уходит как было (только без метаданных, если
 * так велят настройки): `null` вместо результата. Так в Firefox, где у WebCodecs нет AAC, а звук
 * пришлось бы перекодировать: молча уронить звук хуже, чем не сжать. И так же — если кодер
 * всё-таки замолчал (`STALL_MS`): несжатое видео лучше вечного «Сжимается…».
 */
import type { InputAudioTrack } from './mediabunny';
import { videoPlan, type MediaCompression } from './mediaSettings';

export interface CompressedVideo {
  blob: Blob;
  width: number;
  height: number;
}

/** Контейнеры, у которых своё на месте снимает `mp4Metadata.ts`: несжатыми они уходят и так. */
const isMp4 = (type: string) => /^video\/(mp4|quicktime)$/.test(type);

/** Пакетов на оценку битрейта и частоты кадров — без чтения всего файла. */
const SAMPLE_PACKETS = 300;
/** AAC до стольких раз тяжелее ступени переносится как есть: перекодировать звук ради копеек — терять его. */
const AUDIO_SLACK = 1.25;
/** Столько без единого кадра — кодер завис: сдаёмся и шлём несжатое. */
const STALL_MS = 20_000;
/** Сколько ждать первого кадра от кодера в проверке профиля. */
const PROBE_MS = 1_000;
/** Длина очереди кодера, на которой Mediabunny ждёт его (`encodeQueueSize >= 4`), — проверка повторяет её. */
const ENCODER_QUEUE = 4;

/** Умеет ли браузер вообще кодировать H.264 — для подсказки в настройках. */
export async function canCompressVideo(): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  return (await avcCodecString(1280, 720, 2_500_000)) !== null;
}

/**
 * Пережать по ступени. `null` — выигрывать нечего или браузер не справится; бросает только
 * отмену (`signal`).
 */
export async function compressVideo(
  source: Blob,
  compression: MediaCompression,
  stripMetadata: boolean,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<CompressedVideo | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const mb = await import('./mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(source), formats: [mb.MP4, mb.QTFF, mb.WEBM, mb.MATROSKA] });
  // Своя отмена — и по просьбе снаружи, и по сторожу зависаний.
  const stop = new AbortController();
  const forward = () => stop.abort();
  signal.addEventListener('abort', forward, { once: true });
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const alive = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => stop.abort(), STALL_MS);
  };
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video || !(await video.canDecode())) return null;
    const stats = await video.computePacketStats(SAMPLE_PACKETS);
    const width = await video.getDisplayWidth();
    const height = await video.getDisplayHeight();
    const plan = videoPlan({ width, height, bitrate: stats.averageBitrate || undefined, frameRate: stats.averagePacketRate || undefined }, compression);
    // Нечего выигрывать — но WebM всё равно в mp4: иначе на iPhone его не посмотрят.
    if (!plan && isMp4(source.type)) return null;
    const target = plan ?? { width, height, bitrate: undefined, audioBitrate: undefined, frameRate: undefined };
    const codec = await avcCodecString(target.width, target.height, target.bitrate ?? stats.averageBitrate);
    if (!codec) return null;

    const audio = await input.getPrimaryAudioTrack();
    const audioWay = audio ? await audioPlan(mb, audio, target.audioBitrate) : null;
    if (audio && !audioWay) return null;

    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
    const pictures = new mb.VideoSampleSource({
      codec: 'avc',
      fullCodecString: codec,
      sizeChangeBehavior: 'fill',
      ...(target.bitrate ? { quality: new mb.Quality({ bitrate: target.bitrate }) } : {}),
    });
    output.addVideoTrack(pictures);
    const sound =
      audioWay === 'copy'
        ? new mb.EncodedAudioPacketSource('aac')
        : audioWay
          ? new mb.AudioSampleSource({ codec: 'aac', quality: new mb.Quality({ bitrate: audioWay.bitrate }) })
          : null;
    if (sound) output.addAudioTrack(sound);
    // Без метаданных — ничего: у нового файла их нет. Иначе — теги исходника.
    if (!stripMetadata) output.setMetadataTags(await input.getMetadataTags());
    await output.start();

    const duration = (await video.computeDuration()) || 1;
    const step = target.frameRate ? 1 / target.frameRate : undefined;
    const pumpPictures = async () => {
      // Поворот исходника — в пиксели: `CanvasSink` рисует кадр так, как его показывают.
      const frames = new mb.CanvasSink(video, { width: target.width, height: target.height, fit: 'fill', poolSize: 2 });
      let next = -Infinity;
      for await (const frame of frames.canvases()) {
        stop.signal.throwIfAborted();
        // Частота выше ступени — лишние кадры пропускаются, а не смешиваются.
        if (step !== undefined) {
          if (frame.timestamp < next - step / 2) continue;
          next = (Number.isFinite(next) ? next : frame.timestamp) + step;
        }
        const sample = new mb.VideoSample(frame.canvas, { timestamp: frame.timestamp, duration: step ?? frame.duration });
        try {
          await pictures.add(sample);
        } finally {
          sample.close();
        }
        alive();
        onProgress(Math.min(1, Math.max(0, frame.timestamp / duration)));
      }
      pictures.close();
    };
    const pumpSound = async () => {
      if (!audio || !sound) return;
      if (sound instanceof mb.EncodedAudioPacketSource) {
        const decoderConfig = (await audio.getDecoderConfig()) ?? undefined;
        let first = true;
        for await (const packet of new mb.EncodedPacketSink(audio).packets()) {
          stop.signal.throwIfAborted();
          await sound.add(packet, first && decoderConfig ? { decoderConfig } : undefined);
          first = false;
        }
      } else {
        for await (const sample of new mb.AudioSampleSink(audio).samples()) {
          stop.signal.throwIfAborted();
          try {
            await sound.add(sample);
          } finally {
            sample.close();
          }
        }
      }
      sound.close();
    };

    alive();
    try {
      await Promise.all([pumpPictures(), pumpSound()]);
      await output.finalize();
    } catch (error) {
      await output.cancel().catch(() => {});
      throw error;
    }
    signal.throwIfAborted();
    const buffer = output.target.buffer;
    if (!buffer) return null;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    // Сжатие, после которого файл больше, — не сжатие (как у фото).
    if (blob.size >= source.size && isMp4(source.type)) return null;
    return { blob, width: target.width, height: target.height };
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  } finally {
    clearTimeout(watchdog);
    signal.removeEventListener('abort', forward);
    input.dispose();
  }
}

/**
 * Что делать со звуком: AAC не тяжелее ступени — перенести как есть (без потерь и без
 * кодировщика), иначе — перекодировать в AAC. `null` — перекодировать нечем.
 */
async function audioPlan(mb: typeof import('./mediabunny'), audio: InputAudioTrack, bitrate: number | undefined): Promise<'copy' | { bitrate: number } | null> {
  if ((await audio.getCodec()) === 'aac') {
    const stats = await audio.computePacketStats(SAMPLE_PACKETS);
    if (!bitrate || stats.averageBitrate <= bitrate * AUDIO_SLACK) return 'copy';
  }
  const target = bitrate ?? 128_000;
  if (!(await audio.canDecode())) return null;
  const numberOfChannels = await audio.getNumberOfChannels();
  const sampleRate = await audio.getSampleRate();
  return (await mb.canEncodeAudio('aac', { numberOfChannels, sampleRate, quality: new mb.Quality({ bitrate: target }) })) ? { bitrate: target } : null;
}

/**
 * Строка кодека H.264 для кадра: High, как у нативной, а где кодер в нём молчит, пока очередь
 * короткая (WebKit), — Baseline. Уровень — по числу макроблоков: 3.1 до 720p, 4.0 до 1080p.
 * `null` — H.264 браузер не кодирует.
 */
async function avcCodecString(width: number, height: number, bitrate: number | undefined): Promise<string | null> {
  const blocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const level = blocks <= 3600 ? '1f' : blocks <= 8192 ? '28' : '33';
  for (const profile of ['6400', '4200']) {
    const codec = `avc1.${profile}${level}`;
    const config: VideoEncoderConfig = { codec, width, height, ...(bitrate ? { bitrate } : {}) };
    const support = await VideoEncoder.isConfigSupported(config).catch(() => ({ supported: false }));
    if (!support.supported) continue;
    if (profile === '4200' || (await encodesWithShortQueue(config))) return codec;
  }
  return null;
}

/** Отдаёт ли кодер кадры, когда в очереди не больше `ENCODER_QUEUE`, — так, как его кормит Mediabunny. */
async function encodesWithShortQueue(config: VideoEncoderConfig): Promise<boolean> {
  let produced = false;
  const encoder = new VideoEncoder({ output: () => (produced = true), error: () => {} });
  try {
    encoder.configure(config);
    const canvas = new OffscreenCanvas(config.width, config.height);
    const context = canvas.getContext('2d');
    if (!context) return false;
    const deadline = performance.now() + PROBE_MS;
    for (let i = 0; !produced && performance.now() < deadline; i++) {
      context.fillStyle = i % 2 ? '#000' : '#fff';
      context.fillRect(0, 0, config.width, config.height);
      const frame = new VideoFrame(canvas, { timestamp: i * 33_333 });
      encoder.encode(frame);
      frame.close();
      while (!produced && encoder.encodeQueueSize >= ENCODER_QUEUE && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    return produced;
  } catch {
    return false;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}
